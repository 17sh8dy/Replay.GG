import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { ReplayBufferStatus } from '@shared/types'
import { requireFfmpeg } from './ffmpeg'
import { buildCaptureArgs } from './captureArgs'
import { getSettings } from './settings'
import { detectActiveGame } from './games'
import { addFromFile } from './library'
import { gracefulStop } from './recorder'
import { broadcast, toast } from './events'

const exec = promisify(execFile)

/**
 * Instant Replay.
 *
 * ffmpeg writes a continuous stream of short MPEG-TS segments into a scratch
 * directory. We prune anything older than the configured window, so disk use
 * stays bounded. Saving a replay concatenates the newest segments covering the
 * requested duration — MPEG-TS is used precisely because it concatenates
 * losslessly without a re-encode, making saves near-instant.
 */

/* Short segments make the buffer usable within ~2-4s of switching on. */
const SEGMENT_SECONDS = 2

let child: ChildProcess | null = null
let pruneTimer: NodeJS.Timeout | null = null
let statusTimer: NodeJS.Timeout | null = null

let status: ReplayBufferStatus = {
  enabled: false,
  active: false,
  buffered: 0,
  capacity: 0,
  error: null
}

function segmentDir(): string {
  return join(app.getPath('userData'), 'replay-buffer')
}

function setStatus(patch: Partial<ReplayBufferStatus>): void {
  status = { ...status, ...patch }
  broadcast('replay:status', status)
}

export function getReplayStatus(): ReplayBufferStatus {
  return status
}

interface Segment {
  path: string
  index: number
  mtime: number
}

function listSegments(): Segment[] {
  const dir = segmentDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith('seg') && f.endsWith('.ts'))
    .map((f) => {
      const full = join(dir, f)
      const index = Number(f.replace(/\D/g, '')) || 0
      let mtime = 0
      try {
        mtime = statSync(full).mtimeMs
      } catch {
        /* raced with a prune */
      }
      return { path: full, index, mtime }
    })
    .filter((s) => s.mtime > 0)
    .sort((a, b) => a.index - b.index)
}

/**
 * Drops segments beyond the configured window. Always keeps one extra segment
 * so a save issued right after a prune still covers the full requested span.
 */
function prune(): void {
  const { length } = getSettings().replayBuffer
  const keep = Math.ceil(length / SEGMENT_SECONDS) + 2
  const segments = listSegments()
  if (segments.length <= keep) return

  for (const seg of segments.slice(0, segments.length - keep)) {
    try {
      unlinkSync(seg.path)
    } catch {
      /* ffmpeg may still hold the newest handle; it will be caught next pass */
    }
  }
}

export async function enableReplayBuffer(): Promise<ReplayBufferStatus> {
  if (child) return status

  const settings = getSettings()
  setStatus({ enabled: true, error: null, capacity: settings.replayBuffer.length })

  try {
    const bin = await requireFfmpeg()
    const dir = segmentDir()

    // Start from a clean slate so stale segments from a previous run can never
    // leak into a saved clip.
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })

    const args = await buildCaptureArgs(settings, {
      outputArgs: [
        /* Force a keyframe at every segment boundary. Relying on -g alone let some encoders
           (AMD AMF here) go a minute or more between keyframes, so the first segment never
           closed and the buffer sat on "Warming up" indefinitely. */
        '-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
        '-f', 'segment',
        '-segment_time', String(SEGMENT_SECONDS),
        '-segment_format', 'mpegts',
        '-reset_timestamps', '1',
        '-strftime', '0'
      ],
      output: join(dir, 'seg%06d.ts')
    })

    child = spawn(bin, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })

    let stderr = ''
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString()
      if (stderr.length > 8000) stderr = stderr.slice(-4000)
    })

    child.on('error', (err) => {
      teardown()
      setStatus({ enabled: false, active: false, error: err.message, buffered: 0 })
      toast('error', `Instant Replay failed: ${err.message}`)
    })

    child.on('close', (code) => {
      const wasEnabled = status.enabled
      teardown()
      if (code !== 0 && code !== 255 && wasEnabled) {
        setStatus({ enabled: false, active: false, buffered: 0, error: `ffmpeg exited (${code})` })
        toast('error', 'Instant Replay stopped unexpectedly')
      } else {
        setStatus({ active: false, buffered: 0 })
      }
    })

    pruneTimer = setInterval(prune, SEGMENT_SECONDS * 1000)
    statusTimer = setInterval(() => {
      const segments = listSegments()
      // The newest segment is still being written, so it does not count.
      const complete = Math.max(0, segments.length - 1)
      setStatus({
        active: complete > 0,
        buffered: Math.min(complete * SEGMENT_SECONDS, getSettings().replayBuffer.length)
      })
    }, 1000)

    return status
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    teardown()
    setStatus({ enabled: false, active: false, error: message })
    toast('error', message)
    return status
  }
}

export async function disableReplayBuffer(): Promise<ReplayBufferStatus> {
  const proc = child
  setStatus({ enabled: false })
  if (proc) await gracefulStop(proc, 5000)
  teardown()
  rmSync(segmentDir(), { recursive: true, force: true })
  setStatus({ active: false, buffered: 0 })
  return status
}

export async function toggleReplayBuffer(): Promise<ReplayBufferStatus> {
  return status.enabled ? disableReplayBuffer() : enableReplayBuffer()
}

/**
 * Writes the last `seconds` of buffered gameplay to a clip.
 * Returns the created file path, or null when the buffer had nothing usable.
 */
export async function saveReplay(seconds?: number): Promise<string | null> {
  if (!child || !status.enabled) {
    toast('error', 'Instant Replay is not running')
    return null
  }

  const settings = getSettings()
  const want = seconds ?? settings.replayBuffer.clipLength
  const segments = listSegments()

  // Exclude the segment ffmpeg is actively writing — it has no valid tail.
  const complete = segments.slice(0, -1)
  if (complete.length === 0) {
    toast('error', 'Instant Replay is still filling its buffer')
    return null
  }

  const needed = Math.ceil(want / SEGMENT_SECONDS)
  const chosen = complete.slice(-needed)

  try {
    const bin = await requireFfmpeg()
    const game = await detectActiveGame()
    mkdirSync(settings.storage.clipsPath, { recursive: true })

    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
    const base = (game ?? 'Clip').replace(/[<>:"/\\|?*]/g, '').trim() || 'Clip'
    const output = join(settings.storage.clipsPath, `${base} ${stamp}.mp4`)

    // concat demuxer needs a manifest; paths are single-quoted with any inner
    // quote escaped, per ffmpeg's concat syntax.
    const listFile = join(segmentDir(), 'concat.txt')
    const manifest = chosen
      .map((s) => `file '${s.path.replace(/'/g, "'\\''")}'`)
      .join('\n')
    writeFileSync(listFile, manifest, 'utf8')

    const actual = chosen.length * SEGMENT_SECONDS
    const trimFront = Math.max(0, actual - want)

    await exec(
      bin,
      [
        '-hide_banner', '-loglevel', 'error',
        '-y',
        // Seek before -i: with -c copy this lands on a keyframe, so the clip
        // opens cleanly instead of on a partial frame.
        ...(trimFront > 0 ? ['-ss', String(trimFront)] : []),
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        '-movflags', '+faststart',
        output
      ],
      { windowsHide: true, timeout: 60_000 }
    )

    try {
      unlinkSync(listFile)
    } catch {
      /* best effort */
    }

    await addFromFile(output, 'clip', game)
    toast('success', `Saved last ${want}s`)
    return output
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[replay] save failed', err)
    toast('error', `Could not save replay: ${message}`)
    return null
  }
}

function teardown(): void {
  if (pruneTimer) {
    clearInterval(pruneTimer)
    pruneTimer = null
  }
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
  child = null
}

export async function shutdownReplayBuffer(): Promise<void> {
  if (child) {
    setStatus({ enabled: false })
    await gracefulStop(child, 5000)
    teardown()
  }
  rmSync(segmentDir(), { recursive: true, force: true })
}
