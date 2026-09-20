import { app } from 'electron'
import { getSettings, updateSettings } from './settings'

/**
 * Launch on startup.
 *
 * Windows keeps its own record of which apps start at sign-in (the Run key, plus the
 * Startup-apps switch in Task Manager / Settings). That record — not our settings file — is
 * the truth about whether Replay.gg will actually launch, so on every start the toggle is
 * reconciled TO it: if it was turned on or off from Windows, the setting follows.
 *
 * Nothing here needs a restart. Windows reads the entry at the next sign-in.
 */

/** Passed on the login launch so the app can start quietly in the tray. */
export const STARTUP_ARG = '--startup'

/**
 * Only an installed build registers itself. An unpackaged dev run would register electron.exe
 * from node_modules, which is a broken startup entry the moment the folder moves.
 */
export function startupSupported(): boolean {
  return app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin')
}

export function launchedAtLogin(): boolean {
  return process.argv.includes(STARTUP_ARG)
}

const entry = {
  path: process.execPath,
  args: [STARTUP_ARG]
}

/** What the OS will really do at next sign-in. */
function osWillLaunch(): boolean {
  const s = app.getLoginItemSettings(entry)
  // `executableWillLaunchAtLogin` is false when the user switched the entry off in Windows.
  return s.executableWillLaunchAtLogin ?? s.openAtLogin
}

/** Make the OS match the setting. Returns what the OS says afterwards. */
export function applyLaunchOnStartup(enabled: boolean): boolean {
  if (!startupSupported()) return false
  app.setLoginItemSettings({ ...entry, openAtLogin: enabled })
  return osWillLaunch()
}

/** Pull the setting toward reality (called once at startup). */
export function syncLaunchOnStartup(): void {
  if (!startupSupported()) return
  const actual = osWillLaunch()
  if (getSettings().general.launchOnStartup !== actual) {
    updateSettings({ general: { launchOnStartup: actual } })
  }
}
