/**
 * Single source of truth for the IPC surface. The preload bridge, the main
 * process handlers and the renderer client are all generated from these names,
 * so adding a capability means touching this file first.
 */

export const IPC = {
  // Recording
  recordingStart: 'recording:start',
  recordingStop: 'recording:stop',
  recordingStatus: 'recording:get-status',

  // Replay buffer
  replayEnable: 'replay:enable',
  replayDisable: 'replay:disable',
  replaySave: 'replay:save',
  replayStatus: 'replay:get-status',

  // Library
  libraryList: 'library:list',
  libraryGet: 'library:get',
  libraryRename: 'library:rename',
  libraryDelete: 'library:delete',
  libraryDeleteMany: 'library:delete-many',
  libraryFavorite: 'library:favorite',
  libraryReveal: 'library:reveal',
  libraryGames: 'library:games',
  libraryRescan: 'library:rescan',
  libraryCreateClip: 'library:create-clip',

  // Settings
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsReset: 'settings:reset',
  settingsPickFolder: 'settings:pick-folder',

  // System
  systemCapabilities: 'system:capabilities',
  systemStorage: 'system:storage',
  systemAudioDevices: 'system:audio-devices',
  systemVideoDevices: 'system:video-devices',
  systemActiveGame: 'system:active-game',

  // Nova Account (optional; see main/services/account.ts)
  accountState: 'account:state',
  accountRefresh: 'account:refresh',
  accountSignIn: 'account:sign-in',
  accountCancel: 'account:cancel-sign-in',
  accountSignOut: 'account:sign-out',
  accountOpenHelp: 'account:open-help',
  accountOpenSite: 'account:open-site',
  accountReopenSignIn: 'account:reopen-sign-in',

  // Window chrome
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** Channel used for all main -> renderer pushes; payload is `{ type, data }`. */
export const EVENT_CHANNEL = 'app:event'
