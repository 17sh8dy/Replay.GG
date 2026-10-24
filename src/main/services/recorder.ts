import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { RecordingStatus } from '@shared/types'
import { requireFfmpeg } from './ffmpeg'
import { buildCaptureArgs } from './captureArgs'
import { getSettings } from './settings'
import { detectActiveGame } from './games'
import { addFromFile } from './library'
import { broadcast, toast } from './events'

const exec = promisify(execFile)

/**
 * Full-session recorder. Owns at most one ffmpeg child at a time; the replay
 * buffer runs its own independent process so the two can coexist.
 *
 * A recording is a *session* made of one or more ffmpeg *parts*. Parts are written as
 * fragmented MP4, so a part stays playable even if ffmpeg dies mid-write (a plain MP4 has
 * no index until a clean stop, which once lost a whole hour of footage). Pausing ends the
 * current part; resuming starts a new one; an unexpected ffmpeg exit starts a new part
 * automatically. On stop the parts are joined losslessly into the final MP4.
 */
interface Session {
  finalPath: string
  partsDir: string
  parts: string[]
  game: string | null
  /** Seconds recorded in finished parts. */
  doneSec: number
  /** When the running part started, ms; null while no part is running. */
  partStartedAt: number | null
  /** Why the running part is being ended; null means ffmpeg died on its own. */
  ending: 'pause' | 'stop' | null
  crashes: number
}

const MAX_AUTO_RESTARTS = 5
const FRAGMENTED = ['-movflags', '+frag_keyframe+empty_moov+default_base_moof']

let child: ChildProcess | null = null
let session: Session | null = null
let status: RecordingStatus = {
  state: 'idle',
  elapsed: 0,
  game: null,
  startedAt: null,
  error: null
}
let ticker: NodeJS.Timeout | null = null

function setStatus(patch: Partial<RecordingStatus>): void {
  status = { ...status, ...patch }
  broadcast('recording:status', status)
}

export function getRecordingStatus(): RecordingStatus {
  return status
}

function timestampName(game: string | null): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  const prefix = game ? sanitize(game) : 'Recording'
  return `${prefix} ${stamp}.mp4`
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim() || 'Recording'
}

function elapsedSec(s: Session): number {
  const running = s.partStartedAt ? (Date.now() - s.partStartedAt) / 1000 : 0
  return Math.floor(s.doneSec + running)
}

function startTicker(): void {
  stopTicker()
  ticker = setInterval(() => {
    if (session && status.state === 'recording') setStatus({ elapsed: elapsedSec(session) })
  }, 1000)
}

function stopTicker(): void {
  if (ticker) clearInterval(ticker)
  ticker = null
}

export async function startRecording(): Promise<RecordingStatus> {
  if (status.state !== 'idle') return status

  setStatus({ state: 'starting', error: null, elapsed: 0 })

  try {
    const settings = getSettings()
    const game = await detectActiveGame()

    mkdirSync(settings.storage.recordingsPath, { recursive: true })
    const finalPath = join(settings.storage.recordingsPath, timestampName(game))
    const partsDir = join(settings.storage.recordingsPath, `.${basename(finalPath, '.mp4')}.parts`)
    mkdirSync(partsDir, { recursive: true })

    session = {
      finalPath,
      partsDir,
      parts: [],
      game,
      doneSec: 0,
      partStartedAt: null,
      ending: null,
      crashes: 0
    }

    await startPart()
    setStatus({ state: 'recording', startedAt: Date.now(), game, elapsed: 0 })
    startTicker()
    return status
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (session) rmSync(session.partsDir, { recursive: true, force: true })
    session = null
    child = null
    stopTicker()
    setStatus({ state: 'idle', error: message })
    toast('error', message)
    return status
  }
}

/** Spawns ffmpeg writing the next part of the current session. */
async function startPart(): Promise<void> {
  const s = session
  if (!s) return
  const bin = await requireFfmpeg()
  const part = join(s.partsDir, `part${String(s.parts.length + 1).padStart(3, '0')}.mp4`)
  const args = await buildCaptureArgs(getSettings(), { outputArgs: FRAGMENTED, output: part })

  const proc = spawn(bin, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
  s.parts.push(part)
  s.ending = null
  s.partStartedAt = Date.now()
  child = proc

  let stderr = ''
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
    // Keep only the tail — a long session would otherwise grow unbounded.
    if (stderr.length > 8000) stderr = stderr.slice(-4000)
  })

  proc.on('error', (err) => {
    console.error('[recorder] spawn failed', err)
    void onPartClosed(proc, -1, err.message)
  })
  proc.on('close', (code) => void onPartClosed(proc, code, lastError(stderr)))
}

async function onPartClosed(
  proc: ChildProcess,
  code: number | null,
  detail: string | null
): Promise<void> {
  const s = session
  // 'error' and 'close' can both fire for one process; only the first counts.
  if (!s || proc !== child) return
  child = null

  const lived = s.partStartedAt ? (Date.now() - s.partStartedAt) / 1000 : 0
  s.doneSec += lived
  s.partStartedAt = null

  if (s.ending === 'pause') {
    setStatus({ state: 'paused', elapsed: Math.floor(s.doneSec) })
    return
  }
  if (s.ending === 'stop') {
    await finalize(s)
    return
  }

  // ffmpeg died on its own (capture source lost, encoder reset, ...). Whatever it wrote is
  // still playable, so keep it and carry on in a fresh part rather than losing the session.
  console.error(`[recorder] ffmpeg exited unexpectedly (${code}): ${detail}`)
  s.crashes++
  if (s.crashes <= MAX_AUTO_RESTARTS && lived >= 1) {
    try {
      await startPart()
      toast('info', 'Recording hit a snag and recovered — nothing before it was lost')
      return
    } catch (err) {
      console.error('[recorder] restart failed', err)
    }
  }
  toast(
    'error',
    `Recording stopped unexpectedly: ${detail ?? `ffmpeg exited with code ${code}`}. Saving what was captured.`
  )
  await finalize(s)
}

export async function stopRecording(): Promise<RecordingStatus> {
  const s = session
  if (!s || status.state === 'idle' || status.state === 'stopping') return status
  stopTicker()
  setStatus({ state: 'stopping' })
  if (child) {
    s.ending = 'stop'
    await gracefulStop(child, 30_000)
    // onPartClosed finalizes; wait so callers see the settled state.
    await waitForIdle()
  } else {
    await finalize(s)
  }
  return status
}

function waitForIdle(timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now()
    const tick = (): void => {
      if (status.state === 'idle' || Date.now() - started > timeoutMs) resolve()
      else setTimeout(tick, 100)
    }
    tick()
  })
}

export async function pauseRecording(): Promise<RecordingStatus> {
  const s = session
  if (!s || status.state !== 'recording' || !child) return status
  s.ending = 'pause'
  setStatus({ elapsed: elapsedSec(s) })
  await gracefulStop(child, 30_000)
  return status
}

export async function resumeRecording(): Promise<RecordingStatus> {
  const s = session
  if (!s || status.state !== 'paused') return status
  try {
    await startPart()
    setStatus({ state: 'recording' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    toast('error', `Couldn't resume recording: ${message}`)
    setStatus({ error: message })
  }
  return status
}

export async function togglePause(): Promise<RecordingStatus> {
  return status.state === 'paused' ? resumeRecording() : pauseRecording()
}

export async function toggleRecording(): Promise<RecordingStatus> {
  return status.state === 'idle' ? startRecording() : stopRecording()
}

/** Joins the session's parts into the final MP4 and registers it in the library. */
async function finalize(s: Session): Promise<void> {
  stopTicker()
  setStatus({ state: 'stopping' })
  const result = await joinParts(s.parts, s.finalPath, s.partsDir)
  session = null
  child = null
  setStatus({ state: 'idle', elapsed: 0, startedAt: null, game: null, error: null })

  if (result.files.length === 0) {
    toast('error', 'Nothing was recorded')
    return
  }
  for (const file of result.files) await addFromFile(file, 'recording', s.game)
  toast(
    'success',
    result.files.length === 1 ? 'Recording saved' : `Recording saved in ${result.files.length} parts`
  )
}

/**
 * Losslessly joins parts into `finalPath`. A part is never deleted until its footage is in a
 * finished file; if the join fails, the parts themselves are moved out as recordings.
 */
async function joinParts(
  parts: string[],
  finalPath: string,
  partsDir: string
): Promise<{ files: string[] }> {
  const usable = parts.filter((p) => existsSync(p) && statSync(p).size > 2048)
  if (usable.length === 0) {
    rmSync(partsDir, { recursive: true, force: true })
    return { files: [] }
  }

  try {
    const bin = await requireFfmpeg()
    const list = join(partsDir, 'concat.txt')
    const manifest = usable
      .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n')
    writeFileSync(list, manifest, 'utf8')
    const tmp = join(partsDir, 'joined.mp4')
    await exec(
      bin,
      [
        '-hide_banner', '-loglevel', 'error',
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', list,
        '-c', 'copy',
        '-movflags', '+faststart',
        tmp
      ],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
    )
    if (!existsSync(tmp) || statSync(tmp).size < 2048) throw new Error('join produced no output')
    renameSync(tmp, finalPath)
    rmSync(partsDir, { recursive: true, force: true })
    return { files: [finalPath] }
  } catch (err) {
    console.error('[recorder] join failed, keeping parts', err)
    const files: string[] = []
    const dir = dirname(finalPath)
    const stem = basename(finalPath, '.mp4')
    usable.forEach((p, i) => {
      const dest = join(dir, usable.length === 1 ? `${stem}.mp4` : `${stem} (part ${i + 1}).mp4`)
      try {
        renameSync(p, dest)
        files.push(dest)
      } catch (e) {
        console.error('[recorder] could not move part', p, e)
      }
    })
    if (files.length === usable.length) rmSync(partsDir, { recursive: true, force: true })
    return { files }
  }
}

/**
 * Called at launch: a crash or power loss can leave `.parts` folders behind. Their footage
 * is still playable, so turn each one into a normal recording instead of losing it.
 */
export async function recoverOrphanedRecordings(): Promise<void> {
  const dir = getSettings().storage.recordingsPath
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    if (!entry.startsWith('.') || !entry.endsWith('.parts')) continue
    const partsDir = join(dir, entry)
    if (session?.partsDir === partsDir) continue
    try {
      const parts = readdirSync(partsDir)
        .filter((f) => /^part\d+\.mp4$/.test(f))
        .sort()
        .map((f) => join(partsDir, f))
      const finalPath = join(dir, `${entry.slice(1, -'.parts'.length)} (recovered).mp4`)
      const { files } = await joinParts(parts, finalPath, partsDir)
      for (const file of files) await addFromFile(file, 'recording', null)
      if (files.length > 0) toast('success', 'Recovered a recording from an interrupted session')
    } catch (err) {
      console.error('[recorder] recovery failed for', partsDir, err)
    }
  }
}

/**
 * Asks ffmpeg to finish writing by sending `q` on stdin, which flushes the
 * muxer cleanly. Killing the process instead can truncate the last fragment.
 */
export function gracefulStop(proc: ChildProcess, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const done = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }

    const timer = setTimeout(() => {
      console.warn('[recorder] graceful stop timed out, killing')
      try {
        proc.kill('SIGKILL')
      } catch {
        /* already gone */
      }
      done()
    }, timeoutMs)

    proc.once('close', done)
    try {
      proc.stdin?.write('q')
      proc.stdin?.end()
    } catch {
      try {
        proc.kill()
      } catch {
        /* already gone */
      }
      done()
    }
  })
}

/** Pulls the most useful line out of an ffmpeg stderr tail. */
function lastError(stderr: string): string | null {
  const lines = stderr.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const meaningful = lines.reverse().find((l) => !/^\s*(frame|size)=/.test(l))
  return meaningful?.trim() ?? null
}

/** Called on app quit so we never orphan a capture process. */
export async function shutdownRecorder(): Promise<void> {
  // Finish the join if we can; if quit is forced, the fragmented parts are recovered next launch.
  if (session) await stopRecording()
}
