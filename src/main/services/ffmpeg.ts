import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { AudioDevice, EncoderInfo, Encoder } from '@shared/types'

const exec = promisify(execFile)

/**
 * ffmpeg discovery + capability probing.
 *
 * We do not ship a binary in v1. Resolution order is: an explicit override, a
 * binary bundled next to the app under `resources/ffmpeg`, then PATH. When
 * nothing is found the app still runs — recording is disabled and the UI
 * surfaces a setup prompt rather than failing at capture time.
 */

interface Resolved {
  ffmpeg: string | null
  ffprobe: string | null
}

let resolved: Resolved | null = null
let encoderCache: EncoderInfo[] | null = null

function candidateDirs(): string[] {
  const dirs: string[] = []
  if (process.env.REPLAYGG_FFMPEG_DIR) dirs.push(process.env.REPLAYGG_FFMPEG_DIR)
  // Packaged: resources/ffmpeg/ffmpeg.exe — dev: <root>/resources/ffmpeg
  dirs.push(join(process.resourcesPath ?? '', 'ffmpeg'))
  dirs.push(join(app.getAppPath(), 'resources', 'ffmpeg'))
  return dirs
}

function findBinary(name: string): string | null {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  for (const dir of candidateDirs()) {
    if (!dir) continue
    const full = join(dir, exe)
    if (existsSync(full)) return full
  }
  return null
}

async function onPath(name: string): Promise<string | null> {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  try {
    await exec(exe, ['-version'], { windowsHide: true })
    return exe
  } catch {
    return null
  }
}

export async function resolveFfmpeg(): Promise<Resolved> {
  if (resolved) return resolved
  const ffmpeg = findBinary('ffmpeg') ?? (await onPath('ffmpeg'))
  const ffprobe = findBinary('ffprobe') ?? (await onPath('ffprobe'))
  resolved = { ffmpeg, ffprobe }
  if (!ffmpeg) {
    console.warn('[ffmpeg] no binary found — recording features are disabled')
  }
  return resolved
}

export async function ffmpegPath(): Promise<string | null> {
  return (await resolveFfmpeg()).ffmpeg
}

export async function requireFfmpeg(): Promise<string> {
  const path = await ffmpegPath()
  if (!path) {
    throw new Error(
      'ffmpeg was not found. Install ffmpeg and make sure it is on your PATH, or place ffmpeg.exe in the app’s resources/ffmpeg folder.'
    )
  }
  return path
}

/** All encoders we know how to drive, in preference order. */
const KNOWN_ENCODERS: { id: Exclude<Encoder, 'auto'>; label: string; ffName: string }[] = [
  { id: 'nvenc_h264', label: 'NVIDIA NVENC (H.264)', ffName: 'h264_nvenc' },
  { id: 'nvenc_hevc', label: 'NVIDIA NVENC (HEVC)', ffName: 'hevc_nvenc' },
  { id: 'amf_h264', label: 'AMD AMF (H.264)', ffName: 'h264_amf' },
  { id: 'qsv_h264', label: 'Intel Quick Sync (H.264)', ffName: 'h264_qsv' },
  { id: 'x264', label: 'Software (x264)', ffName: 'libx264' }
]

export function ffNameFor(encoder: Exclude<Encoder, 'auto'>): string {
  return KNOWN_ENCODERS.find((e) => e.id === encoder)?.ffName ?? 'libx264'
}

/**
 * Actually encodes a few synthetic frames with `ffName`.
 *
 * Checking `-encoders` only proves ffmpeg was *built* with an encoder, not
 * that this machine can run it: a build with NVENC support on an AMD box
 * lists h264_nvenc happily and then dies with "Cannot load nvcuda.dll" the
 * moment capture starts. This probe is the ground truth.
 */
async function canEncode(bin: string, ffName: string): Promise<boolean> {
  try {
    await exec(
      bin,
      [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi',
        '-i', 'nullsrc=s=320x180:r=30',
        '-frames:v', '3',
        '-c:v', ffName,
        '-f', 'null', '-'
      ],
      { windowsHide: true, timeout: 20_000 }
    )
    return true
  } catch {
    return false
  }
}

/**
 * Reports which encoders this machine can genuinely use. Results are cached
 * for the process lifetime — the probe costs a few hundred ms and the answer
 * cannot change without a driver change and a restart.
 */
export async function probeEncoders(): Promise<EncoderInfo[]> {
  if (encoderCache) return encoderCache
  const bin = await ffmpegPath()
  if (!bin) {
    encoderCache = KNOWN_ENCODERS.map((e) => ({
      id: e.id,
      label: e.label,
      available: false,
      reason: 'ffmpeg not found'
    }))
    return encoderCache
  }

  // Cheap pre-filter: skip the real probe for anything not in the build.
  let built = ''
  try {
    const res = await exec(bin, ['-hide_banner', '-encoders'], {
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024
    })
    built = res.stdout
  } catch (err) {
    console.error('[ffmpeg] could not list encoders', err)
  }

  encoderCache = await Promise.all(
    KNOWN_ENCODERS.map(async (e): Promise<EncoderInfo> => {
      if (built && !built.includes(e.ffName)) {
        return {
          id: e.id,
          label: e.label,
          available: false,
          reason: 'Not supported by this ffmpeg build'
        }
      }
      const works = await canEncode(bin, e.ffName)
      return {
        id: e.id,
        label: e.label,
        available: works,
        reason: works ? undefined : 'No compatible hardware or driver found'
      }
    })
  )

  const usable = encoderCache.filter((e) => e.available).map((e) => e.id)
  console.log(`[ffmpeg] usable encoders: ${usable.join(', ') || 'none'}`)
  return encoderCache
}

/** Resolves `auto` to the best available hardware encoder, else software. */
export async function pickEncoder(preferred: Encoder): Promise<string> {
  const encoders = await probeEncoders()
  if (preferred !== 'auto') {
    const match = encoders.find((e) => e.id === preferred)
    if (match?.available) return ffNameFor(preferred)
    console.warn(`[ffmpeg] ${preferred} unavailable, falling back`)
  }
  const best = encoders.find((e) => e.available && e.id !== 'x264')
  return best ? ffNameFor(best.id as Exclude<Encoder, 'auto'>) : 'libx264'
}

/** Enumerates DirectShow audio inputs. Windows-only; returns [] elsewhere. */
export async function listAudioDevices(): Promise<AudioDevice[]> {
  if (process.platform !== 'win32') return []
  const bin = await ffmpegPath()
  if (!bin) return []

  // ffmpeg writes the device list to stderr and exits non-zero by design.
  let stderr = ''
  try {
    await exec(bin, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], {
      windowsHide: true
    })
  } catch (err) {
    stderr = (err as { stderr?: string }).stderr ?? ''
  }

  const devices: AudioDevice[] = []
  // Lines look like:  [dshow @ ...] "Microphone (Realtek)" (audio)
  const re = /"([^"]+)"\s*\(audio\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(stderr)) !== null) {
    const label = match[1]
    if (!devices.some((d) => d.id === label)) devices.push({ id: label, label })
  }
  return devices
}

export interface ProbeResult {
  duration: number
  width: number
  height: number
  fps: number
}

/** Reads real dimensions/duration off a produced file. */
export async function probeMedia(file: string): Promise<ProbeResult | null> {
  const { ffprobe } = await resolveFfmpeg()
  if (!ffprobe) return null
  try {
    const { stdout } = await exec(
      ffprobe,
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
        '-of', 'json',
        file
      ],
      { windowsHide: true }
    )
    const parsed = JSON.parse(stdout) as {
      streams?: { width?: number; height?: number; r_frame_rate?: string }[]
      format?: { duration?: string }
    }
    const stream = parsed.streams?.[0]
    if (!stream) return null
    const [num, den] = (stream.r_frame_rate ?? '0/1').split('/').map(Number)
    return {
      duration: Number(parsed.format?.duration ?? 0),
      width: stream.width ?? 0,
      height: stream.height ?? 0,
      fps: den ? Math.round(num / den) : 0
    }
  } catch (err) {
    console.error(`[ffmpeg] probe failed for ${file}`, err)
    return null
  }
}

/** Grabs a single frame as a thumbnail. Best-effort — failures are non-fatal. */
export async function generateThumbnail(
  source: string,
  dest: string,
  atSeconds = 1
): Promise<boolean> {
  const bin = await ffmpegPath()
  if (!bin) return false
  try {
    await exec(
      bin,
      [
        '-hide_banner', '-loglevel', 'error',
        '-y',
        '-ss', String(atSeconds),
        '-i', source,
        '-frames:v', '1',
        '-vf', 'scale=640:-2',
        '-q:v', '4',
        dest
      ],
      { windowsHide: true, timeout: 30_000 }
    )
    return existsSync(dest)
  } catch {
    return false
  }
}
