import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { RecordingStatus } from '@shared/types'
import { requireFfmpeg } from './ffmpeg'
import { buildCaptureArgs } from './captureArgs'
import { getSettings } from './settings'
import { detectActiveGame } from './games'
import { addFromFile } from './library'
import { broadcast, toast } from './events'

/**
 * Full-session recorder. Owns exactly one ffmpeg child at a time; the replay
 * buffer runs its own independent process so the two can coexist.
 */

let child: ChildProcess | null = null
let status: RecordingStatus = {
  state: 'idle',
  elapsed: 0,
  game: null,
  startedAt: null,
  error: null
}
let ticker: NodeJS.Timeout | null = null
let currentFile: string | null = null

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

export async function startRecording(): Promise<RecordingStatus> {
  if (status.state === 'recording' || status.state === 'starting') return status

  setStatus({ state: 'starting', error: null, elapsed: 0 })

  try {
    const bin = await requireFfmpeg()
    const settings = getSettings()
    const game = await detectActiveGame()

    mkdirSync(settings.storage.recordingsPath, { recursive: true })
    const output = join(settings.storage.recordingsPath, timestampName(game))
    currentFile = output

    const args = await buildCaptureArgs(settings, {
      outputArgs: ['-movflags', '+faststart'],
      output
    })

    child = spawn(bin, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      // Keep only the tail — a long session would otherwise grow unbounded.
      if (stderr.length > 8000) stderr = stderr.slice(-4000)
    })

    child.on('error', (err) => {
      console.error('[recorder] spawn failed', err)
      cleanup()
      setStatus({ state: 'idle', error: err.message })
      toast('error', `Recording failed to start: ${err.message}`)
    })

    child.on('close', (code) => {
      const wasRecording = status.state === 'recording' || status.state === 'stopping'
      const file = currentFile
      cleanup()

      // ffmpeg exits 255 on our graceful 'q' shutdown, which is a success here.
      if (code !== 0 && code !== 255 && wasRecording) {
        const message = lastError(stderr) ?? `ffmpeg exited with code ${code}`
        setStatus({ state: 'idle', error: message, elapsed: 0, startedAt: null })
        toast('error', `Recording failed: ${message}`)
        return
      }

      setStatus({ state: 'idle', elapsed: 0, startedAt: null, game: null, error: null })
      if (file) {
        void addFromFile(file, 'recording', game).then(() => {
          toast('success', 'Recording saved')
        })
      }
    })

    const startedAt = Date.now()
    setStatus({ state: 'recording', startedAt, game, elapsed: 0 })

    ticker = setInterval(() => {
      setStatus({ elapsed: Math.floor((Date.now() - startedAt) / 1000) })
    }, 1000)

    return status
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    cleanup()
    setStatus({ state: 'idle', error: message })
    toast('error', message)
    return status
  }
}

export async function stopRecording(): Promise<RecordingStatus> {
  if (!child || status.state === 'idle') return status
  setStatus({ state: 'stopping' })
  await gracefulStop(child)
  return status
}

export async function toggleRecording(): Promise<RecordingStatus> {
  return status.state === 'idle' ? startRecording() : stopRecording()
}

/**
 * Asks ffmpeg to finish writing by sending `q` on stdin, which flushes the
 * moov atom. Killing the process instead would leave an unplayable MP4.
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

function cleanup(): void {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
  child = null
  currentFile = null
}

/** Pulls the most useful line out of an ffmpeg stderr tail. */
function lastError(stderr: string): string | null {
  const lines = stderr.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const meaningful = lines.reverse().find((l) => !/^\s*(frame|size)=/.test(l))
  return meaningful?.trim() ?? null
}

/** Called on app quit so we never orphan a capture process. */
export async function shutdownRecorder(): Promise<void> {
  if (child) await gracefulStop(child, 5000)
}
