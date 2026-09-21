import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { JsonStore, type DeepPartial } from '../store'

function defaultSettings(): Settings {
  const videos = app.getPath('videos')
  return {
    capture: {
      mode: 'display',
      displayId: null,
      quality: 'high',
      resolution: 'native',
      fps: 60,
      bitrate: 30,
      encoder: 'auto'
    },
    audio: {
      systemAudioEnabled: true,
      systemAudioDeviceId: null,
      systemAudioVolume: 1,
      microphoneEnabled: false,
      microphoneDeviceId: null,
      microphoneVolume: 1,
      separateTracks: false
    },
    webcam: {
      enabled: false,
      deviceId: null,
      position: 'bottom-right',
      size: 20
    },
    replayBuffer: {
      enabled: false,
      length: 300,
      clipLength: 30
    },
    storage: {
      recordingsPath: join(videos, 'Replay.gg', 'Recordings'),
      clipsPath: join(videos, 'Replay.gg', 'Clips'),
      maxStorage: 0,
      autoCleanup: false
    },
    hotkeys: {
      toggleRecording: { accelerator: 'Ctrl+Alt+R' },
      saveReplay: { accelerator: 'Ctrl+Alt+S' },
      toggleReplayBuffer: { accelerator: 'Ctrl+Alt+B' },
      screenshot: { accelerator: 'Ctrl+Alt+P' }
    },
    general: {
      launchOnStartup: false,
      minimizeToTray: true,
      showNotifications: true
    },
    notifications: {
      clipCapture: {
        enabled: true,
        display: 'all',
        position: 'top-right',
        customX: 50,
        customY: 10,
        duration: 3,
        animation: 'fade-slide'
      }
    }
  }
}

let store: JsonStore<Settings> | null = null

function getStore(): JsonStore<Settings> {
  if (!store) store = new JsonStore<Settings>('settings.json', defaultSettings())
  return store
}

/** Windows screen capture tops out at 60fps; see GDIGRAB_MAX_FPS in captureArgs.ts. */
const MAX_FPS = 60

export function getSettings(): Settings {
  const settings = getStore().get()
  // Older versions offered 120/144. Show and use what capture can actually deliver.
  if (settings.capture.fps > MAX_FPS) {
    return { ...settings, capture: { ...settings.capture, fps: MAX_FPS } }
  }
  return settings
}

export function updateSettings(patch: DeepPartial<Settings>): Settings {
  const next = getStore().patch(patch)
  ensureStorageDirs(next)
  return next
}

export function resetSettings(): Settings {
  const next = getStore().reset()
  ensureStorageDirs(next)
  return next
}

/** Creates the configured output folders if they do not exist yet. */
export function ensureStorageDirs(settings: Settings = getSettings()): void {
  for (const dir of [settings.storage.recordingsPath, settings.storage.clipsPath]) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch (err) {
      console.error(`[settings] could not create ${dir}`, err)
    }
  }
}
