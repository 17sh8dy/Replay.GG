import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { AudioDevice } from '@shared/types'

const exec = promisify(execFile)

/**
 * System audio ("what the speakers are playing").
 *
 * ffmpeg's DirectShow input only sees capture devices (microphones, Stereo Mix), and ffmpeg has no
 * WASAPI input, so a playback device can never be recorded through it. `resources/helpers/loopback.exe`
 * (source: native/loopback.cs) opens a WASAPI loopback on a playback device and serves it as raw
 * PCM on a named pipe, which ffmpeg reads like any other input.
 */

/** Prefix of a system-audio device id that means "loopback of this playback device". */
const PREFIX = 'loopback:'

/** True for ids meant for the loopback helper. No id at all means the default speakers. */
export function isLoopbackId(id: string | null | undefined): boolean {
  return !id || id.startsWith(PREFIX)
}

function helperPath(): string | null {
  if (process.platform !== 'win32') return null
  for (const dir of [join(process.resourcesPath ?? '', 'helpers'), join(app.getAppPath(), 'resources', 'helpers')]) {
    const full = join(dir, 'loopback.exe')
    if (existsSync(full)) return full
  }
  return null
}

/** Playback devices, the default first. Empty when the helper is missing or Windows reports none. */
export async function listLoopbackDevices(): Promise<AudioDevice[]> {
  const bin = helperPath()
  if (!bin) return []
  try {
    const res = await exec(bin, ['--list'], { windowsHide: true, encoding: 'utf8' })
    return res.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [id, ...name] = line.split('\t')
        return { id: `${PREFIX}${id}`, label: name.join('\t'), output: true }
      })
  } catch (err) {
    console.error('[loopback] list failed', err)
    return []
  }
}

export interface LoopbackFeed {
  pipe: string
  stop: () => void
}

let counter = 0

/**
 * Starts the helper for `deviceId` and resolves once its pipe exists, so ffmpeg can connect
 * straight away. The helper exits by itself when ffmpeg closes the pipe; `stop` covers a
 * capture that never connected.
 */
export async function startLoopback(deviceId: string | null): Promise<LoopbackFeed | null> {
  const bin = helperPath()
  if (!bin) return null
  const pipe = `replaygg-sys-${process.pid}-${++counter}`
  const args = ['--pipe', pipe]
  if (deviceId && deviceId.startsWith(PREFIX)) args.push('--device', deviceId.slice(PREFIX.length))

  const child: ChildProcess = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const stop = (): void => {
    if (!child.killed && child.exitCode === null) child.kill()
  }

  const ready = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000)
    child.stdout?.on('data', (d: Buffer) => {
      if (d.toString().includes('ready')) {
        clearTimeout(timer)
        resolve(true)
      }
    })
    child.stderr?.on('data', (d: Buffer) => console.error('[loopback]', d.toString().trim()))
    child.once('exit', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.once('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })

  if (!ready) {
    stop()
    return null
  }
  return { pipe, stop }
}
