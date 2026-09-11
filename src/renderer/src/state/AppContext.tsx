import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type {
  RecordingStatus,
  ReplayBufferStatus,
  Settings,
  StorageUsage,
  SystemCapabilities
} from '@shared/types'

/**
 * Holds the state every screen needs: live capture status, settings and system
 * capabilities. Library data is intentionally *not* here — screens fetch their
 * own slices and re-fetch on the `libraryVersion` signal, which keeps large
 * media lists out of a global re-render.
 */

export interface Toast {
  id: number
  level: 'info' | 'success' | 'error'
  message: string
}

interface AppState {
  ready: boolean
  settings: Settings | null
  recording: RecordingStatus
  replay: ReplayBufferStatus
  capabilities: SystemCapabilities | null
  storage: StorageUsage | null
  /** Increments whenever the library changes; screens depend on it to refetch. */
  libraryVersion: number
  toasts: Toast[]

  updateSettings: (patch: DeepPartial<Settings>) => Promise<void>
  resetSettings: () => Promise<void>
  refreshStorage: () => Promise<void>
  refreshCapabilities: () => Promise<void>
  toggleRecording: () => Promise<void>
  toggleReplayBuffer: () => Promise<void>
  saveReplay: () => Promise<void>
  pushToast: (level: Toast['level'], message: string) => void
  dismissToast: (id: number) => void
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

const IDLE_RECORDING: RecordingStatus = {
  state: 'idle',
  elapsed: 0,
  game: null,
  startedAt: null,
  error: null
}

const IDLE_REPLAY: ReplayBufferStatus = {
  enabled: false,
  active: false,
  buffered: 0,
  capacity: 0,
  error: null
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [recording, setRecording] = useState<RecordingStatus>(IDLE_RECORDING)
  const [replay, setReplay] = useState<ReplayBufferStatus>(IDLE_REPLAY)
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null)
  const [storage, setStorage] = useState<StorageUsage | null>(null)
  const [libraryVersion, setLibraryVersion] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])

  const toastId = useRef(0)

  const pushToast = useCallback((level: Toast['level'], message: string) => {
    const id = ++toastId.current
    setToasts((prev) => [...prev, { id, level, message }])
    // Errors linger; successes get out of the way quickly.
    const ttl = level === 'error' ? 6000 : 3200
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ttl)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const refreshStorage = useCallback(async () => {
    setStorage(await window.replay.system.storage())
  }, [])

  const refreshCapabilities = useCallback(async () => {
    setCapabilities(await window.replay.system.capabilities())
  }, [])

  // Initial load.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [s, rec, rep, caps, use] = await Promise.all([
        window.replay.settings.get(),
        window.replay.recording.status(),
        window.replay.replay.status(),
        window.replay.system.capabilities(),
        window.replay.system.storage()
      ])
      if (cancelled) return
      setSettings(s)
      setRecording(rec)
      setReplay(rep)
      setCapabilities(caps)
      setStorage(use)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Main-process push events.
  useEffect(() => {
    const offRecording = window.replay.on('recording:status', setRecording)
    const offReplay = window.replay.on('replay:status', setReplay)
    const offLibrary = window.replay.on('library:changed', () => {
      setLibraryVersion((v) => v + 1)
      void refreshStorage()
    })
    const offToast = window.replay.on('toast', ({ level, message }) => pushToast(level, message))

    return () => {
      offRecording()
      offReplay()
      offLibrary()
      offToast()
    }
  }, [pushToast, refreshStorage])

  const updateSettings = useCallback(async (patch: DeepPartial<Settings>) => {
    setSettings(await window.replay.settings.update(patch))
  }, [])

  const resetSettings = useCallback(async () => {
    setSettings(await window.replay.settings.reset())
  }, [])

  const toggleRecording = useCallback(async () => {
    if (recording.state === 'idle') {
      setRecording(await window.replay.recording.start())
    } else {
      setRecording(await window.replay.recording.stop())
    }
  }, [recording.state])

  const toggleReplayBuffer = useCallback(async () => {
    if (replay.enabled) {
      setReplay(await window.replay.replay.disable())
      await window.replay.settings.update({ replayBuffer: { enabled: false } })
    } else {
      setReplay(await window.replay.replay.enable())
      await window.replay.settings.update({ replayBuffer: { enabled: true } })
    }
    setSettings(await window.replay.settings.get())
  }, [replay.enabled])

  const saveReplay = useCallback(async () => {
    await window.replay.replay.save()
  }, [])

  const value = useMemo<AppState>(
    () => ({
      ready,
      settings,
      recording,
      replay,
      capabilities,
      storage,
      libraryVersion,
      toasts,
      updateSettings,
      resetSettings,
      refreshStorage,
      refreshCapabilities,
      toggleRecording,
      toggleReplayBuffer,
      saveReplay,
      pushToast,
      dismissToast
    }),
    [
      ready,
      settings,
      recording,
      replay,
      capabilities,
      storage,
      libraryVersion,
      toasts,
      updateSettings,
      resetSettings,
      refreshStorage,
      refreshCapabilities,
      toggleRecording,
      toggleReplayBuffer,
      saveReplay,
      pushToast,
      dismissToast
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
