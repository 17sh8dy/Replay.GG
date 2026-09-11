import { BrowserWindow } from 'electron'
import { EVENT_CHANNEL } from '@shared/ipc'
import type { AppEvents } from '@shared/types'

/** Pushes a typed event to every open renderer. */
export function broadcast<K extends keyof AppEvents>(type: K, data: AppEvents[K]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(EVENT_CHANNEL, { type, data })
    }
  }
}

export function toast(level: 'info' | 'success' | 'error', message: string): void {
  broadcast('toast', { level, message })
}
