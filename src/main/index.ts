import { app, shell, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'node:path'
import { getDb, closeDb } from './db/connection'
import { registerIpc } from './ipc'

const isDev = !app.isPackaged

/** Shared with the renderer's top bar so the two line up exactly. */
const TITLEBAR_HEIGHT = 40

/** Native window-button colours per theme, applied when the renderer toggles. */
const OVERLAY = {
  dark: { color: '#0a0a0c', symbolColor: '#9c9ca6' },
  light: { color: '#f2efe8', symbolColor: '#5e5c66' }
} as const

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: 'Oryn',
    // The title bar is drawn by the renderer; only the min/max/close buttons
    // stay native, so Windows keeps snap layouts and correct hit targets.
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...OVERLAY.dark, height: TITLEBAR_HEIGHT },
    icon: nativeImage.createFromPath(join(__dirname, '../../resources/icon.png')),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // External links open in the real browser, never inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (isDev && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

// One instance per database, so a file never has two writers. A run pointed at
// an explicit ORYN_DB_PATH is writing somewhere else, so it may run alongside.
const needsLock = !process.env.ORYN_DB_PATH

if (needsLock && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    // Windows groups taskbar buttons and routes notifications by this id.
    // The taskbar *icon* still comes from the running .exe, so in dev it is
    // Electron's own; the packaged Oryn.exe embeds resources/icon.png.
    if (process.platform === 'win32') app.setAppUserModelId('com.oryn.app')

    getDb() // opens the file and runs migrations before any IPC can arrive
    registerIpc()

    // Repaints the native window buttons when the renderer switches theme.
    ipcMain.handle('window:theme', (event, theme: 'dark' | 'light') => {
      const win = BrowserWindow.fromWebContents(event.sender)
      win?.setTitleBarOverlay?.({ ...OVERLAY[theme], height: TITLEBAR_HEIGHT })
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', closeDb)
}
