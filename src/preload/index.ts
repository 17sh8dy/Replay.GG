import { contextBridge, ipcRenderer } from 'electron'
import { EVENT_CHANNEL, IPC } from '@shared/ipc'
import type { AccountState } from '@shared/types'
import type {
  AppEvents,
  AudioDevice,
  ClipRequest,
  LibraryQuery,
  MediaItem,
  RecordingStatus,
  ReplayBufferStatus,
  Settings,
  StorageUsage,
  SystemCapabilities,
  VideoDevice
} from '@shared/types'

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

/**
 * The renderer's entire view of the main process. Nothing else is exposed —
 * no `ipcRenderer`, no Node primitives.
 */
const api = {
  recording: {
    start: (): Promise<RecordingStatus> => ipcRenderer.invoke(IPC.recordingStart),
    stop: (): Promise<RecordingStatus> => ipcRenderer.invoke(IPC.recordingStop),
    status: (): Promise<RecordingStatus> => ipcRenderer.invoke(IPC.recordingStatus)
  },

  replay: {
    enable: (): Promise<ReplayBufferStatus> => ipcRenderer.invoke(IPC.replayEnable),
    disable: (): Promise<ReplayBufferStatus> => ipcRenderer.invoke(IPC.replayDisable),
    save: (seconds?: number): Promise<string | null> => ipcRenderer.invoke(IPC.replaySave, seconds),
    status: (): Promise<ReplayBufferStatus> => ipcRenderer.invoke(IPC.replayStatus)
  },

  library: {
    list: (query: LibraryQuery = {}): Promise<MediaItem[]> =>
      ipcRenderer.invoke(IPC.libraryList, query),
    get: (id: string): Promise<MediaItem | null> => ipcRenderer.invoke(IPC.libraryGet, id),
    rename: (id: string, title: string): Promise<MediaItem | null> =>
      ipcRenderer.invoke(IPC.libraryRename, id, title),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.libraryDelete, id),
    removeMany: (ids: string[]): Promise<{ removed: number; failed: number }> =>
      ipcRenderer.invoke(IPC.libraryDeleteMany, ids),
    setFavorite: (id: string, favorite: boolean): Promise<MediaItem | null> =>
      ipcRenderer.invoke(IPC.libraryFavorite, id, favorite),
    reveal: (id: string): Promise<void> => ipcRenderer.invoke(IPC.libraryReveal, id),
    games: (): Promise<string[]> => ipcRenderer.invoke(IPC.libraryGames),
    rescan: (): Promise<MediaItem[]> => ipcRenderer.invoke(IPC.libraryRescan),
    createClip: (request: ClipRequest): Promise<MediaItem | null> =>
      ipcRenderer.invoke(IPC.libraryCreateClip, request)
  },

  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch: DeepPartial<Settings>): Promise<Settings> =>
      ipcRenderer.invoke(IPC.settingsUpdate, patch),
    reset: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsReset),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.settingsPickFolder)
  },

  /**
   * The Nova product switcher. Sends a product ID only; the main process decides whether that
   * is a website (opened in the default browser) or an installed app (launched in the
   * background), so the renderer can never ask for an arbitrary path or address.
   */
  products: {
    open: (id: string): Promise<'launched' | 'focused' | 'running' | 'browser' | 'unknown'> =>
      ipcRenderer.invoke(IPC.productOpen, id)
  },

  system: {
    capabilities: (): Promise<SystemCapabilities> => ipcRenderer.invoke(IPC.systemCapabilities),
    storage: (): Promise<StorageUsage> => ipcRenderer.invoke(IPC.systemStorage),
    audioDevices: (): Promise<AudioDevice[]> => ipcRenderer.invoke(IPC.systemAudioDevices),
    videoDevices: (): Promise<VideoDevice[]> => ipcRenderer.invoke(IPC.systemVideoDevices),
    /** Best-effort name of the game currently in the foreground, or null. */
    activeGame: (): Promise<string | null> => ipcRenderer.invoke(IPC.systemActiveGame)
  },

  /**
   * The optional Nova Account.
   *
   * Every one of these returns an `AccountState` and nothing more — a display name, whether
   * somebody is signed in, and a pending code. The token stays in the main process, which is
   * why the renderer can keep a CSP that cannot reach the network at all.
   */
  account: {
    state: (): Promise<AccountState> => ipcRenderer.invoke(IPC.accountState),
    refresh: (): Promise<AccountState> => ipcRenderer.invoke(IPC.accountRefresh),
    signIn: (): Promise<AccountState> => ipcRenderer.invoke(IPC.accountSignIn),
    cancel: (): Promise<AccountState> => ipcRenderer.invoke(IPC.accountCancel),
    signOut: (): Promise<AccountState> => ipcRenderer.invoke(IPC.accountSignOut),
    openHelp: (): Promise<void> => ipcRenderer.invoke(IPC.accountOpenHelp),
    reopenSignIn: (): Promise<void> => ipcRenderer.invoke(IPC.accountReopenSignIn),
    openSite: (target: 'help' | 'nova' | 'account'): Promise<void> =>
      ipcRenderer.invoke(IPC.accountOpenSite, target)
  },

  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC.windowMinimize),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke(IPC.windowMaximize),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.windowClose),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.windowIsMaximized)
  },

  /** Subscribes to a main-process event. Returns an unsubscribe function. */
  on<K extends keyof AppEvents>(type: K, handler: (data: AppEvents[K]) => void): () => void {
    const listener = (_e: unknown, payload: { type: string; data: unknown }): void => {
      if (payload?.type === type) handler(payload.data as AppEvents[K])
    }
    ipcRenderer.on(EVENT_CHANNEL, listener)
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, listener)
  },

  /** Builds a URL the renderer can feed to <video> / <img> for local media. */
  mediaUrl: (path: string): string =>
    `replay-media://local/?path=${encodeURIComponent(path)}`
}

export type ReplayApi = typeof api

contextBridge.exposeInMainWorld('replay', api)
