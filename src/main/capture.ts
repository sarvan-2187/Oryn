import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { createCapture } from './db/queries/planner'
import { getDb } from './db/connection'

export const DEFAULT_HOTKEY = 'Control+Shift+Space'

let captureWin: BrowserWindow | null = null

function settingValue(key: string, fallback: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined
  return row?.value ?? fallback
}

export function saveSetting(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value)
}

export function currentHotkey(): string {
  return settingValue('hotkey', DEFAULT_HOTKEY)
}

/**
 * Small always-on-top window for capturing a thought without leaving whatever
 * you are doing. Created once and hidden rather than destroyed, so reopening
 * is instant instead of paying renderer startup every time.
 */
function buildCaptureWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 620,
    height: 132,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}/capture.html`)
  else void win.loadFile(join(__dirname, '../renderer/capture.html'))

  // Losing focus means the user moved on, so get out of the way.
  win.on('blur', () => win.hide())
  win.on('close', (e) => {
    if (!(app as unknown as { isQuitting?: boolean }).isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  return win
}

export function toggleCaptureWindow(): void {
  if (!captureWin || captureWin.isDestroyed()) captureWin = buildCaptureWindow()

  if (captureWin.isVisible()) {
    captureWin.hide()
    return
  }

  // Centre horizontally on the display holding the pointer, a third down, so it
  // lands where the eye already is rather than on some other monitor.
  const cursor = screen.getCursorScreenPoint()
  const area = screen.getDisplayNearestPoint(cursor).workArea
  const [w, h] = captureWin.getSize()
  captureWin.setPosition(
    Math.round(area.x + (area.width - w) / 2),
    Math.round(area.y + area.height / 3 - h / 2)
  )

  captureWin.show()
  captureWin.focus()
  captureWin.webContents.send('capture:opened')
}

/** Returns true when the accelerator was accepted by the OS. */
export function registerHotkey(accelerator: string): boolean {
  globalShortcut.unregisterAll()
  if (!accelerator) return false
  try {
    return globalShortcut.register(accelerator, toggleCaptureWindow)
  } catch {
    return false
  }
}

export function registerCaptureIpc(): void {
  ipcMain.handle('capture:save', (_e, text: string) => {
    const created = createCapture(String(text ?? ''))
    captureWin?.hide()
    // Refresh any open inbox so a capture appears without a manual reload.
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('captures:changed')
    return created
  })

  ipcMain.handle('capture:close', () => captureWin?.hide())

  ipcMain.handle('capture:setHotkey', (_e, accelerator: string) => {
    const ok = registerHotkey(accelerator)
    if (ok) saveSetting('hotkey', accelerator)
    // A rejected accelerator must not leave the app with no hotkey at all.
    else registerHotkey(currentHotkey())
    return ok
  })

  ipcMain.handle('capture:getHotkey', () => currentHotkey())
}
