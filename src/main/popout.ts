import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

/** Keyed by note id so re-popping an already-open note focuses it instead of duplicating the window. */
const noteWindows = new Map<number, BrowserWindow>()

export function popOutNote(noteId: number): void {
  const existing = noteWindows.get(noteId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return
  }

  const win = new BrowserWindow({
    width: 640,
    height: 720,
    minWidth: 420,
    minHeight: 360,
    backgroundColor: '#000000',
    title: 'Oryn',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}/?note=${noteId}`)
  else
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { note: String(noteId) } })

  noteWindows.set(noteId, win)
  win.on('closed', () => noteWindows.delete(noteId))
}
