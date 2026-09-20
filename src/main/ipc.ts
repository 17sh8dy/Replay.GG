import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { ClipRequest, LibraryQuery, Settings } from '@shared/types'
import type { DeepPartial } from './store'
import * as library from './services/library'
import { getSettings, resetSettings, updateSettings } from './services/settings'
import { getRecordingStatus, startRecording, stopRecording } from './services/recorder'
import {
  disableReplayBuffer,
  enableReplayBuffer,
  getReplayStatus,
  saveReplay
} from './services/replayBuffer'
import { getCapabilities, getStorageUsage } from './services/storage'
import { listAudioDevices, listVideoDevices } from './services/ffmpeg'
import { registerHotkeys } from './services/hotkeys'
import { detectActiveGame } from './services/games'
import {
  beginSignIn,
  cancelSignIn,
  getAccountState,
  openHelp,
  openSite,
  reopenSignIn,
  refreshAccount,
  signOutAccount
} from './services/account'

/**
 * Wires every channel in the IPC contract to its service. Handlers stay thin —
 * all real behaviour lives in `services/`.
 */
export function registerIpcHandlers(): void {
  // --- Recording -----------------------------------------------------------
  ipcMain.handle(IPC.recordingStart, () => startRecording())
  ipcMain.handle(IPC.recordingStop, () => stopRecording())
  ipcMain.handle(IPC.recordingStatus, () => getRecordingStatus())

  // --- Replay buffer -------------------------------------------------------
  ipcMain.handle(IPC.replayEnable, () => enableReplayBuffer())
  ipcMain.handle(IPC.replayDisable, () => disableReplayBuffer())
  ipcMain.handle(IPC.replaySave, (_e, seconds?: number) => saveReplay(seconds))
  ipcMain.handle(IPC.replayStatus, () => getReplayStatus())

  // --- Library -------------------------------------------------------------
  ipcMain.handle(IPC.libraryList, (_e, query: LibraryQuery = {}) => library.list(query))
  ipcMain.handle(IPC.libraryGet, (_e, id: string) => library.get(id))
  ipcMain.handle(IPC.libraryRename, (_e, id: string, title: string) => library.rename(id, title))
  ipcMain.handle(IPC.libraryDelete, (_e, id: string) => library.remove(id))
  ipcMain.handle(IPC.libraryDeleteMany, (_e, ids: string[]) => library.removeMany(ids))
  ipcMain.handle(IPC.libraryFavorite, (_e, id: string, favorite: boolean) =>
    library.setFavorite(id, favorite)
  )
  ipcMain.handle(IPC.libraryReveal, (_e, id: string) => library.reveal(id))
  ipcMain.handle(IPC.libraryGames, () => library.listGames())
  ipcMain.handle(IPC.libraryRescan, () => library.rescan())
  ipcMain.handle(IPC.libraryCreateClip, (_e, request: ClipRequest) => library.createClip(request))

  /* --- Nova Account --------------------------------------------------------
     Optional, and nothing else in the app reads it. Note what these DO NOT return: no token
     and no account id ever crosses into the renderer, which is what lets the renderer keep
     its `default-src 'self'` CSP. See services/account.ts. */
  ipcMain.handle(IPC.accountState, () => getAccountState())
  ipcMain.handle(IPC.accountRefresh, () => refreshAccount())
  ipcMain.handle(IPC.accountSignIn, () => beginSignIn())
  ipcMain.handle(IPC.accountCancel, () => cancelSignIn())
  ipcMain.handle(IPC.accountSignOut, () => signOutAccount())
  ipcMain.handle(IPC.accountOpenHelp, () => openHelp())
  ipcMain.handle(IPC.accountReopenSignIn, () => reopenSignIn())
  ipcMain.handle(IPC.accountOpenSite, (_e, target: 'help' | 'nova' | 'account') => openSite(target))

  // --- Settings ------------------------------------------------------------
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsUpdate, (_e, patch: DeepPartial<Settings>) => {
    const next = updateSettings(patch)
    // Hotkey edits only take effect once re-registered.
    if (patch.hotkeys) registerHotkeys()
    return next
  })
  ipcMain.handle(IPC.settingsReset, () => {
    const next = resetSettings()
    registerHotkeys()
    return next
  })
  ipcMain.handle(IPC.settingsPickFolder, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // --- System --------------------------------------------------------------
  ipcMain.handle(IPC.systemCapabilities, () => getCapabilities())
  ipcMain.handle(IPC.systemStorage, () => getStorageUsage())
  ipcMain.handle(IPC.systemAudioDevices, () => listAudioDevices())
  ipcMain.handle(IPC.systemVideoDevices, () => listVideoDevices())
  ipcMain.handle(IPC.systemActiveGame, () => detectActiveGame())

  // --- Window chrome -------------------------------------------------------
  ipcMain.handle(IPC.windowMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle(IPC.windowMaximize, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle(IPC.windowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle(IPC.windowIsMaximized, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })
}
