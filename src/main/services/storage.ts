import { startupSupported } from './startup'
import { statfs } from 'node:fs/promises'
import { screen } from 'electron'
import type { DisplayInfo, StorageUsage, SystemCapabilities } from '@shared/types'
import { ffmpegPath, probeEncoders } from './ffmpeg'
import { getSettings } from './settings'
import { usageByKind } from './library'

export async function getStorageUsage(): Promise<StorageUsage> {
  const { recordings, clips } = usageByKind()
  let free = 0
  let total = 0

  try {
    const stats = await statfs(getSettings().storage.recordingsPath)
    free = stats.bsize * stats.bavail
    total = stats.bsize * stats.blocks
  } catch (err) {
    // The path may not exist yet on first launch — not worth surfacing.
    console.warn('[storage] statfs failed', err)
  }

  return { recordings, clips, free, total }
}

export function getDisplays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay()
  return screen.getAllDisplays().map((d, i) => {
    // Electron reports bounds in DIPs; capture backends want physical pixels,
    // so convert or a scaled display would be cropped.
    const physical = screen.dipToScreenRect(null, d.bounds)
    return {
      id: String(d.id),
      label: d.id === primary.id ? `Display ${i + 1} (Primary)` : `Display ${i + 1}`,
      x: physical.x,
      y: physical.y,
      width: physical.width,
      height: physical.height,
      isPrimary: d.id === primary.id,
      scaleFactor: d.scaleFactor
    }
  })
}

export async function getCapabilities(): Promise<SystemCapabilities> {
  const path = await ffmpegPath()
  return {
    ffmpegAvailable: path !== null,
    ffmpegPath: path,
    encoders: await probeEncoders(),
    displays: getDisplays(),
    startupSupported: startupSupported()
  }
}
