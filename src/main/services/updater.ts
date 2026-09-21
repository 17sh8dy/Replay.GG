import { app } from 'electron'
import electronUpdater, { type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { UpdateStatus } from '@shared/types'
import { broadcast } from './events'
import { getRecordingStatus } from './recorder'

/**
 * Auto-update, from the GitHub releases of 17sh8dy/Replay.GG (see `publish` in
 * electron-builder.yml).
 *
 * THE FLOW, and who decides what:
 *   1. The app checks shortly after it starts and every few hours after that. A check downloads
 *      nothing; it only reads the small `latest.yml` on the newest release.
 *   2. If there is a newer version, the state becomes `available` and the renderer shows an
 *      "Update available" card. NOTHING is downloaded until the person says so.
 *   3. Download, then `ready`. Installing happens only when the person chooses "Restart & update".
 *
 * It never installs on its own, never interrupts a recording, and does nothing in a development
 * run (there is no installed app to replace), where the state is `unsupported`.
 */

const FIRST_CHECK_DELAY_MS = 20_000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

// electron-updater is CommonJS; this app's main process is an ES module, so take the default
// export and read `autoUpdater` off it rather than importing the name directly.
const { autoUpdater } = electronUpdater

let status: UpdateStatus = {
  state: app.isPackaged ? 'idle' : 'unsupported',
  currentVersion: app.getVersion(),
  latestVersion: null,
  progress: 0,
  checkedAt: null,
  error: null,
  notes: null
}

function set(patch: Partial<UpdateStatus>): void {
  status = { ...status, ...patch }
  broadcast('update:status', status)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

/** Release notes arrive as a string, or as a list of per-version entries. Keep plain text. */
function notesOf(info: UpdateInfo): string | null {
  const raw = info.releaseNotes
  const text = Array.isArray(raw) ? raw.map((r) => r.note ?? '').join('\n\n') : (raw ?? '')
  const plain = text.replace(/<[^>]+>/g, '').trim()
  return plain ? plain.slice(0, 1500) : null
}

export function initUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  // Installing is always an explicit choice, never a side effect of quitting.
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: null }))
  autoUpdater.on('update-available', (info: UpdateInfo) =>
    set({
      state: 'available',
      latestVersion: info.version,
      notes: notesOf(info),
      progress: 0,
      checkedAt: Date.now()
    })
  )
  autoUpdater.on('update-not-available', () =>
    set({ state: 'idle', latestVersion: null, notes: null, checkedAt: Date.now() })
  )
  autoUpdater.on('download-progress', (p: ProgressInfo) =>
    set({ state: 'downloading', progress: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
    set({ state: 'ready', latestVersion: info.version, progress: 100 })
  )
  autoUpdater.on('error', (err: Error) =>
    set({ state: 'error', error: err?.message ?? String(err), checkedAt: Date.now() })
  )

  setTimeout(() => void checkForUpdates(), FIRST_CHECK_DELAY_MS)
  setInterval(() => void checkForUpdates(), CHECK_EVERY_MS).unref()
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (status.state === 'unsupported') return status
  // Do not disturb one that is already being fetched, or waiting to be installed.
  if (status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') {
    return status
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    set({ state: 'error', error: err instanceof Error ? err.message : String(err) })
  }
  return status
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (status.state !== 'available') return status
  set({ state: 'downloading', progress: 0, error: null })
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    set({ state: 'error', error: err instanceof Error ? err.message : String(err) })
  }
  return status
}

/** Restarts into the installer. Refused while a recording is running: that would cut it off. */
export function installUpdate(): { ok: boolean; reason?: 'recording' | 'not-ready' } {
  if (status.state !== 'ready') return { ok: false, reason: 'not-ready' }
  const rec = getRecordingStatus().state
  if (rec === 'recording' || rec === 'starting' || rec === 'stopping') {
    return { ok: false, reason: 'recording' }
  }
  // Silent (no wizard) and relaunch afterwards; the install folder is reused.
  autoUpdater.quitAndInstall(true, true)
  return { ok: true }
}
