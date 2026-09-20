import { app, BrowserWindow, protocol, net, shell, Tray, Menu, nativeImage } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerIpcHandlers } from './ipc'
import { ensureStorageDirs, getSettings } from './services/settings'
import { registerHotkeys, unregisterHotkeys } from './services/hotkeys'
import { rescan } from './services/library'
import { shutdownRecorder, toggleRecording } from './services/recorder'
import { enableReplayBuffer, saveReplay, shutdownReplayBuffer } from './services/replayBuffer'
import { launchedAtLogin, syncLaunchOnStartup } from './services/startup'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

/**
 * Videos and thumbnails live outside the app bundle, so the renderer cannot
 * reach them over file:// with web security on. This custom scheme exposes
 * exactly the on-disk media the app owns and nothing else.
 */
function registerMediaProtocol(): void {
  protocol.handle('replay-media', (request) => {
    const url = new URL(request.url)
    // replay-media://local/?path=<absolute path>
    const path = url.searchParams.get('path')
    if (!path) return new Response('Missing path', { status: 400 })
    return net.fetch(pathToFileURL(path).toString())
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0B0C0E',
    // Custom chrome — the title bar is drawn in the renderer.
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    // Started by Windows at sign-in: stay in the tray (hotkeys and Instant Replay still run)
    // instead of throwing a window over whatever the person is doing. Only when a tray icon
    // exists to get back in, and never for a normal launch.
    if (launchedAtLogin() && tray && getSettings().general.minimizeToTray) return
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    // Closing to tray keeps hotkeys alive, which is the whole point of a
    // capture app — users close the window but still expect Ctrl+Alt+S.
    if (!quitting && getSettings().general.minimizeToTray) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Keep external links out of the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/**
 * A 16x16 brand-red record dot, drawn in code so there is a visible tray icon without an
 * asset file. (It used to be an empty image — invisible — which matters now that the app can
 * start hidden at login: the tray icon is the way back in.)
 */
function trayIcon(): Electron.NativeImage {
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c)
      const i = (y * size + x) * 4
      const [r, g, b, a] =
        d <= 2.6 ? [255, 255, 255, 255] : d <= 7 ? [230, 41, 63, 255] : d <= 7.8 ? [230, 41, 63, 120] : [0, 0, 0, 0]
      buf[i] = b
      buf[i + 1] = g
      buf[i + 2] = r
      buf[i + 3] = a
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

function createTray(): void {
  const icon = trayIcon()
  try {
    tray = new Tray(icon)
  } catch {
    return
  }

  tray.setToolTip('Replay.gg')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Replay.gg', click: showWindow },
      { type: 'separator' },
      { label: 'Start / Stop Recording', click: () => void toggleRecording() },
      { label: 'Save Instant Replay', click: () => void saveReplay() },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', showWindow)
}

// Only one capture app instance may own the hotkeys and buffer directory.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'replay-media',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])

  void app.whenReady().then(async () => {
    registerMediaProtocol()
    registerIpcHandlers()
    ensureStorageDirs()
    registerHotkeys()
    syncLaunchOnStartup()
    createTray()
    createWindow()

    // Index whatever is already on disk, then start the buffer if the user
    // left it enabled last session.
    void rescan()
    if (getSettings().replayBuffer.enabled) {
      void enableReplayBuffer()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      quitting = true
      app.quit()
    }
  })

  app.on('before-quit', () => {
    quitting = true
  })

  // Flush both ffmpeg children before the process dies, or we leave behind
  // truncated files.
  app.on('will-quit', (event) => {
    unregisterHotkeys()
    if (shuttingDown) return
    shuttingDown = true
    event.preventDefault()
    void Promise.all([shutdownRecorder(), shutdownReplayBuffer()]).finally(() => {
      app.exit(0)
    })
  })
}

let shuttingDown = false
