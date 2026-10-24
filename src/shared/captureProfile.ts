import type { QualityPreset, ResolutionPreset, Settings } from './types'

/**
 * What a capture actually produces, derived from the settings. Shared so the card on Home shows
 * the same numbers ffmpeg is given (captureArgs.ts uses these tables) rather than a copy that
 * could drift.
 */

export const QUALITY_BITRATE: Record<Exclude<QualityPreset, 'custom'>, number> = {
  low: 8,
  medium: 16,
  high: 30,
  ultra: 60
}

export const RESOLUTION_HEIGHT: Record<Exclude<ResolutionPreset, 'native'>, number> = {
  '2160p': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720
}

export function bitrateFor(capture: Settings['capture']): number {
  if (capture.quality === 'custom') return Math.max(1, capture.bitrate)
  return QUALITY_BITRATE[capture.quality]
}

/** Output height: the chosen preset, else the display's own height (null if unknown). */
export function outputHeight(capture: Settings['capture'], displayHeight: number | null): number | null {
  return capture.resolution === 'native' ? displayHeight : RESOLUTION_HEIGHT[capture.resolution]
}
