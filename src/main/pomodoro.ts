import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { logFocus } from './db/queries/planner'
import type { PomodoroState } from '../shared/types'

const FOCUS_MINUTES = 25
const BREAK_MINUTES = 5

let phase: PomodoroState['phase'] = 'focus'
let running = false
let deadline: number | null = null
let remaining = FOCUS_MINUTES * 60

function currentState(): PomodoroState {
  return { phase, running, remaining }
}

function broadcast(): void {
  const state = currentState()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('pomodoro:tick', state)
  }
}

/**
 * Time is tracked against a wall-clock deadline rather than by counting
 * ticks, so the count stays honest when the machine sleeps. Only completed
 * focus blocks are logged, so the heatmap records real work rather than
 * timers that were started and abandoned.
 */
function finish(): void {
  running = false
  deadline = null
  if (phase === 'focus') {
    logFocus(FOCUS_MINUTES)
    phase = 'break'
    remaining = BREAK_MINUTES * 60
  } else {
    phase = 'focus'
    remaining = FOCUS_MINUTES * 60
  }
  broadcast()
}

function tick(): void {
  if (!running || deadline == null) return
  const left = Math.round((deadline - Date.now()) / 1000)
  if (left <= 0) finish()
  else {
    remaining = left
    broadcast()
  }
}

export function getPomodoroState(): PomodoroState {
  return currentState()
}

export function togglePomodoro(): PomodoroState {
  if (running) {
    running = false
    deadline = null
  } else {
    deadline = Date.now() + remaining * 1000
    running = true
  }
  broadcast()
  return currentState()
}

export function resetPomodoro(): PomodoroState {
  running = false
  deadline = null
  remaining = (phase === 'focus' ? FOCUS_MINUTES : BREAK_MINUTES) * 60
  broadcast()
  return currentState()
}

/** Ticks twice a second for a responsive display; returns a stop function. */
export function startPomodoroTicker(): () => void {
  const timer = setInterval(tick, 500)
  return () => clearInterval(timer)
}

let miniWin: BrowserWindow | null = null

/** A small always-on-top window mirroring the dashboard's Pomodoro widget. */
export function openMiniPomodoro(): void {
  if (miniWin && !miniWin.isDestroyed()) {
    miniWin.show()
    miniWin.focus()
    return
  }

  miniWin = new BrowserWindow({
    width: 320,
    height: 68,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0a0a0c',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  miniWin.setAlwaysOnTop(true, 'screen-saver')

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) void miniWin.loadURL(`${devUrl}/pomodoro.html`)
  else void miniWin.loadFile(join(__dirname, '../renderer/pomodoro.html'))

  miniWin.on('closed', () => {
    miniWin = null
  })
}
