/**
 * Shared domain types. Imported by main, preload and renderer — keep this file
 * free of any Node or DOM specific imports.
 */

export type MediaKind = 'recording' | 'clip'

export interface MediaItem {
  id: string
  kind: MediaKind
  /** Display name, user-renameable. Defaults to the source file name. */
  title: string
  /** Absolute path on disk. */
  path: string
  /** Absolute path to the generated thumbnail, if one exists yet. */
  thumbnailPath: string | null
  /** Detected game this was captured from, or null when unknown. */
  game: string | null
  /** Unix ms. */
  createdAt: number
  /** Seconds. */
  duration: number
  /** Bytes. */
  size: number
  width: number
  height: number
  fps: number
  favorite: boolean
  /** For clips: the recording it was cut from, when known. */
  sourceId?: string
}

export type RecorderState = 'idle' | 'recording' | 'paused' | 'starting' | 'stopping'

export interface RecordingStatus {
  state: RecorderState
  /** Seconds elapsed in the active recording. */
  elapsed: number
  /** Game being captured, when detected. */
  game: string | null
  startedAt: number | null
  error: string | null
}

export interface ReplayBufferStatus {
  enabled: boolean
  /** True once the buffer process is actually up and capturing. */
  active: boolean
  /** Seconds currently held in the rolling buffer. */
  buffered: number
  /** Configured buffer length in seconds. */
  capacity: number
  error: string | null
}

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom'
export type Encoder = 'auto' | 'nvenc_h264' | 'nvenc_hevc' | 'amf_h264' | 'qsv_h264' | 'x264'
export type ResolutionPreset = 'native' | '2160p' | '1440p' | '1080p' | '720p'
export type CaptureMode = 'display' | 'window' | 'game'

export interface AudioDevice {
  id: string
  label: string
}

export interface VideoDevice {
  id: string
  label: string
}

export interface Hotkey {
  /** Electron accelerator string, e.g. "Ctrl+Alt+R". Empty string = unbound. */
  accelerator: string
}

export interface Settings {
  capture: {
    mode: CaptureMode
    /** Display id when mode === 'display'. */
    displayId: string | null
    quality: QualityPreset
    resolution: ResolutionPreset
    fps: number
    /** Mbps. Only used when quality === 'custom'. */
    bitrate: number
    encoder: Encoder
  }
  audio: {
    systemAudioEnabled: boolean
    systemAudioDeviceId: string | null
    systemAudioVolume: number
    microphoneEnabled: boolean
    microphoneDeviceId: string | null
    microphoneVolume: number
    /** Keep mic and system audio on separate tracks for later editing. */
    separateTracks: boolean
  }
  /** Composited onto the capture via `scale2ref` + `overlay` — see `captureArgs.ts`. */
  webcam: {
    enabled: boolean
    deviceId: string | null
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    size: number
  }
  replayBuffer: {
    enabled: boolean
    /** Seconds of rolling gameplay kept in memory/disk. */
    length: number
    /** Seconds saved when the user hits the clip hotkey. */
    clipLength: number
  }
  storage: {
    recordingsPath: string
    clipsPath: string
    /** GB. 0 = unlimited. */
    maxStorage: number
    /** Delete oldest recordings once maxStorage is exceeded. */
    autoCleanup: boolean
  }
  hotkeys: {
    toggleRecording: Hotkey
    saveReplay: Hotkey
    toggleReplayBuffer: Hotkey
    screenshot: Hotkey
  }
  general: {
    launchOnStartup: boolean
    minimizeToTray: boolean
    showNotifications: boolean
  }
}

export interface DisplayInfo {
  id: string
  label: string
  /** Physical pixel bounds, ready to hand to a screen-capture backend. */
  x: number
  y: number
  width: number
  height: number
  isPrimary: boolean
  scaleFactor: number
}

export interface StorageUsage {
  /** Bytes used by recordings. */
  recordings: number
  /** Bytes used by clips. */
  clips: number
  /** Bytes free on the volume holding the recordings path. */
  free: number
  /** Total bytes on that volume. */
  total: number
}

export interface EncoderInfo {
  id: Encoder
  label: string
  available: boolean
  /** Why it is unavailable, when it is. */
  reason?: string
}

export interface SystemCapabilities {
  /** False when no usable ffmpeg binary was found — recording is disabled. */
  ffmpegAvailable: boolean
  ffmpegPath: string | null
  encoders: EncoderInfo[]
  displays: DisplayInfo[]
  /** False in dev/unpackaged runs, where registering a startup entry would be wrong. */
  startupSupported: boolean
}

/** Request to cut a clip out of an existing recording. */
export interface ClipRequest {
  sourceId: string
  /** Seconds from the start of the source. */
  start: number
  /** Seconds. */
  duration: number
  title?: string
}

export interface LibraryQuery {
  kind?: MediaKind
  search?: string
  favoritesOnly?: boolean
  game?: string
  sort?: 'newest' | 'oldest' | 'largest' | 'longest' | 'name'
}

/** Payload for main -> renderer push events. */
/** Where auto-update stands. See main/services/updater.ts. */
export interface UpdateStatus {
  /** `unsupported` in a development run: there is no installed app to update. */
  state: 'unsupported' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'
  currentVersion: string
  /** The newer version, once one has been found. */
  latestVersion: string | null
  /** 0-100 while downloading. */
  progress: number
  /** When the last check finished (ms since epoch), or null if none has. */
  checkedAt: number | null
  error: string | null
  /** Plain-text release notes for the new version, when the release has any. */
  notes: string | null
}

export interface AppEvents {
  'recording:status': RecordingStatus
  'replay:status': ReplayBufferStatus
  'library:changed': { kind: MediaKind | 'all' }
  'toast': { level: 'info' | 'success' | 'error'; message: string }
  'update:status': UpdateStatus
}

/**
 * What the renderer is allowed to know about a Nova Account.
 *
 * NOTE WHAT IS ABSENT: no token, no account id, no email address. The token lives in the main
 * process (see main/services/account.ts) so the renderer can keep a CSP that reaches nothing,
 * and this shape is everything a settings pane actually needs to draw itself.
 */
export interface AccountState {
  signedIn: boolean
  displayName: string | null
  /** Present while a sign-in is waiting to be approved in a browser. */
  pending: { userCode: string; verificationUri: string; verificationUriComplete: string } | null
  /** Why the last attempt failed, if it did. */
  problem: string | null
}
