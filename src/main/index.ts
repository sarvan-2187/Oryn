import { app, shell, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import { getDb, closeDb } from './db/connection'
import { carryOverMissedTasks } from './db/queries/tasks'
import { registerIpc } from './ipc'
import { globalShortcut } from 'electron'
import { currentHotkey, registerCaptureIpc, registerHotkey, toggleCaptureWindow } from './capture'
import { startReminders } from './reminders'
import { startPomodoroTicker } from './pomodoro'

const isDev = !app.isPackaged

/** Shared with the renderer's top bar so the two line up exactly. */
const TITLEBAR_HEIGHT = 46

/** Native window-button colours per theme, applied when the renderer toggles. */
const OVERLAY = {
  dark: { color: '#0a0a0c', symbolColor: '#9c9ca6' },
  light: { color: '#f2efe8', symbolColor: '#5e5c66' }
} as const

/** Kept alive at module scope: a garbage-collected Tray disappears from the shelf. */
let tray: Tray | null = null

/** Set once reminders start; cleared and called on quit to stop the hourly check. */
let stopReminders: (() => void) | null = null

/** Set once the Pomodoro ticker starts; cleared and called on quit. */
let stopPomodoroTicker: (() => void) | null = null

/**
 * Resolves the same way packaged and unpackaged: `out/main` sits two levels
 * below the project root in dev and below the asar root once built, and
 * resources/ is bundled alongside it.
 */
function iconPath(): string {
  return join(__dirname, '../../resources/icon.png')
}

function showMainWindow(): void {
  const [win] = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (!win) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function buildTray(): void {
  if (tray) return
  tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 }))
  tray.setToolTip('Oryn')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Oryn', click: showMainWindow },
      { label: `Quick capture (${currentHotkey()})`, click: toggleCaptureWindow },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          ;(app as unknown as { isQuitting?: boolean }).isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', showMainWindow)
}

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
    icon: nativeImage.createFromPath(iconPath()),
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
    carryOverMissedTasks()
    registerIpc()

    // Repaints the native window buttons when the renderer switches theme.
    ipcMain.handle('window:theme', (event, theme: 'dark' | 'light') => {
      const win = BrowserWindow.fromWebContents(event.sender)
      win?.setTitleBarOverlay?.({ ...OVERLAY[theme], height: TITLEBAR_HEIGHT })
    })

    registerCaptureIpc()
    // A hotkey the OS refuses must not leave the app silently without one.
    if (!registerHotkey(currentHotkey())) console.warn('hotkey rejected:', currentHotkey())
    buildTray()
    stopReminders = startReminders(showMainWindow)
    stopPomodoroTicker = startPomodoroTicker()

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    ;(app as unknown as { isQuitting?: boolean }).isQuitting = true
  })

  app.on('will-quit', () => {
    stopReminders?.()
    stopPomodoroTicker?.()
    globalShortcutCleanup()
    closeDb()
  })
}

function globalShortcutCleanup(): void {
  globalShortcut.unregisterAll()
}
