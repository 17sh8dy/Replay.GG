import type { DisplayInfo, QualityPreset, ResolutionPreset, Settings } from '@shared/types'
import { pickEncoder } from './ffmpeg'
import { getDisplays } from './storage'

/**
 * Translates user-facing settings into ffmpeg arguments.
 *
 * Kept separate from the recorder so the recorder and the replay buffer
 * produce byte-identical capture pipelines and only differ in their muxer.
 */

const QUALITY_BITRATE: Record<Exclude<QualityPreset, 'custom'>, number> = {
  low: 8,
  medium: 16,
  high: 30,
  ultra: 60
}

const RESOLUTION_HEIGHT: Record<Exclude<ResolutionPreset, 'native'>, number> = {
  '2160p': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720
}

/**
 * The display to capture: the configured one, else the primary. Returns null
 * only when the user explicitly asked for the full virtual desktop.
 */
function selectedDisplay(settings: Settings): DisplayInfo | null {
  if (settings.capture.mode !== 'display') return null
  const displays = getDisplays()
  if (displays.length === 0) return null

  const chosen = settings.capture.displayId
    ? displays.find((d) => d.id === settings.capture.displayId)
    : undefined

  return chosen ?? displays.find((d) => d.isPrimary) ?? displays[0]
}

export function bitrateFor(capture: Settings['capture']): number {
  if (capture.quality === 'custom') return Math.max(1, capture.bitrate)
  return QUALITY_BITRATE[capture.quality]
}

/** Video input args. Prefers the GPU desktop-duplication path on Windows. */
function videoInput(settings: Settings): string[] {
  const { fps } = settings.capture
  if (process.platform === 'win32') {
    // ddagrab is a filter-based source; it is markedly cheaper than gdigrab
    // but only exists on newer builds. gdigrab is the safe universal fallback.
    const args = ['-f', 'gdigrab', '-framerate', String(fps), '-draw_mouse', '0']

    // Without an explicit region, gdigrab grabs the union of every monitor —
    // a dual-1080p setup would silently produce 3840x1080 files.
    const display = selectedDisplay(settings)
    if (display) {
      args.push(
        '-offset_x', String(display.x),
        '-offset_y', String(display.y),
        '-video_size', `${display.width}x${display.height}`
      )
    }

    args.push('-i', 'desktop')
    return args
  }
  if (process.platform === 'darwin') {
    return ['-f', 'avfoundation', '-framerate', String(fps), '-i', '1:none']
  }
  return ['-f', 'x11grab', '-framerate', String(fps), '-i', process.env.DISPLAY ?? ':0.0']
}

/** DirectShow audio inputs, one `-i` per enabled source. */
function audioInputs(settings: Settings): string[] {
  if (process.platform !== 'win32') return []
  const args: string[] = []
  const { audio } = settings

  if (audio.systemAudioEnabled && audio.systemAudioDeviceId) {
    args.push('-f', 'dshow', '-i', `audio=${audio.systemAudioDeviceId}`)
  }
  if (audio.microphoneEnabled && audio.microphoneDeviceId) {
    args.push('-f', 'dshow', '-i', `audio=${audio.microphoneDeviceId}`)
  }
  return args
}

/** Count of audio inputs actually added, used to build the mix filter. */
function audioInputCount(settings: Settings): number {
  if (process.platform !== 'win32') return 0
  const { audio } = settings
  let n = 0
  if (audio.systemAudioEnabled && audio.systemAudioDeviceId) n++
  if (audio.microphoneEnabled && audio.microphoneDeviceId) n++
  return n
}

function scaleFilter(settings: Settings): string | null {
  const preset = settings.capture.resolution
  if (preset === 'native') return null
  const height = RESOLUTION_HEIGHT[preset]
  // -2 keeps the width even, which every hardware encoder requires.
  return `scale=-2:${height}`
}

/** Is a webcam actually addable — enabled, a device chosen, and dshow available. */
function webcamActive(settings: Settings): boolean {
  return process.platform === 'win32' && settings.webcam.enabled && Boolean(settings.webcam.deviceId)
}

/** DirectShow video input for the webcam, or []. Always index 1 when present. */
function webcamInput(settings: Settings): string[] {
  if (!webcamActive(settings)) return []
  return ['-f', 'dshow', '-i', `video=${settings.webcam.deviceId}`]
}

/**
 * Where the webcam lands relative to the (already-scaled) desktop frame.
 * `W`/`H`/`w`/`h` are ffmpeg's own overlay-filter variables — the main
 * frame's and the overlay's width/height — so this holds regardless of
 * output resolution. 16px keeps it clear of a rounded window corner.
 */
function overlayPosition(position: Settings['webcam']['position']): string {
  const margin = 16
  switch (position) {
    case 'top-left':
      return `${margin}:${margin}`
    case 'top-right':
      return `W-w-${margin}:${margin}`
    case 'bottom-left':
      return `${margin}:H-h-${margin}`
    case 'bottom-right':
    default:
      return `W-w-${margin}:H-h-${margin}`
  }
}

function encoderQualityArgs(ffEncoder: string, mbps: number): string[] {
  const bitrate = `${mbps}M`
  const maxrate = `${Math.round(mbps * 1.5)}M`
  const bufsize = `${mbps * 2}M`

  if (ffEncoder.includes('nvenc')) {
    return [
      '-preset', 'p5',
      '-tune', 'hq',
      '-rc', 'vbr',
      '-b:v', bitrate,
      '-maxrate', maxrate,
      '-bufsize', bufsize
    ]
  }
  if (ffEncoder.includes('amf')) {
    return ['-quality', 'balanced', '-rc', 'vbr_peak', '-b:v', bitrate, '-maxrate', maxrate]
  }
  if (ffEncoder.includes('qsv')) {
    return ['-preset', 'medium', '-b:v', bitrate, '-maxrate', maxrate]
  }
  return [
    '-preset', 'veryfast',
    '-crf', '20',
    '-maxrate', maxrate,
    '-bufsize', bufsize,
    '-pix_fmt', 'yuv420p'
  ]
}

export interface CaptureArgsOptions {
  /** Extra args placed immediately before the output path (muxer options). */
  outputArgs: string[]
  output: string
}

/**
 * Builds the full ffmpeg argv for a capture session.
 * The caller supplies the muxer half so the same pipeline can feed either a
 * single MP4 or the replay buffer's rolling segments.
 */
export async function buildCaptureArgs(
  settings: Settings,
  { outputArgs, output }: CaptureArgsOptions
): Promise<string[]> {
  const ffEncoder = await pickEncoder(settings.capture.encoder)
  const mbps = bitrateFor(settings.capture)
  const nAudio = audioInputCount(settings)
  const webcamOn = webcamActive(settings)
  // The webcam claims input index 1 (right after the desktop capture), so
  // every audio input shifts up by one once it's present.
  const audioBase = webcamOn ? 2 : 1
  const mixAudio = nAudio > 1 && !settings.audio.separateTracks

  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-y',
    ...videoInput(settings),
    ...webcamInput(settings),
    ...audioInputs(settings)
  ]

  const scale = scaleFilter(settings)

  if (webcamOn) {
    // Everything — the video scale/overlay *and* the audio mix, if any — has
    // to go through this one graph: ffmpeg accepts only one `-filter_complex`,
    // and once the video output is a labelled node from one, `-vf` no longer
    // has an implicit `0:v` to apply to.
    //
    // `scale2ref` sizes the webcam (input 1) as a fraction of the *desktop*
    // frame's width — `main_w` below refers to its second input, so this
    // holds regardless of capture resolution — while passing that frame
    // through unchanged as its second output. `null` gives the unscaled
    // desktop frame the same label when no resolution preset applies.
    const frac = Math.min(0.6, Math.max(0.05, settings.webcam.size / 100))
    const graph = [
      scale ? `[0:v]${scale}[main0]` : '[0:v]null[main0]',
      `[1:v][main0]scale2ref=w=main_w*${frac}:h=-1[wc][main]`,
      `[main][wc]overlay=${overlayPosition(settings.webcam.position)}[vout]`
    ]
    if (mixAudio) {
      const labels = Array.from({ length: nAudio }, (_, i) => `[${audioBase + i}:a]`).join('')
      graph.push(`${labels}amix=inputs=${nAudio}:duration=longest[aout]`)
    }
    args.push('-filter_complex', graph.join(';'))
    args.push('-map', '[vout]')
    if (mixAudio) args.push('-map', '[aout]')
    else for (let i = 0; i < nAudio; i++) args.push('-map', `${audioBase + i}:a`)
  } else {
    if (scale) args.push('-vf', scale)

    // Mix multiple audio sources down to one track unless the user asked to
    // keep them separate (useful for editing mic out of a clip later).
    if (mixAudio) {
      args.push('-filter_complex', `[1:a][2:a]amix=inputs=2:duration=longest[aout]`)
      args.push('-map', '0:v', '-map', '[aout]')
    } else if (nAudio > 0) {
      args.push('-map', '0:v')
      for (let i = 1; i <= nAudio; i++) args.push('-map', `${i}:a`)
    } else {
      args.push('-map', '0:v')
    }
  }

  args.push('-c:v', ffEncoder, ...encoderQualityArgs(ffEncoder, mbps))
  args.push('-g', String(settings.capture.fps * 2))

  if (nAudio > 0) args.push('-c:a', 'aac', '-b:a', '192k')

  args.push(...outputArgs, output)
  return args
}
