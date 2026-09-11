# Multi-Window / Focus Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three window/focus features: pop a note out into its own window, an in-app distraction-free writing mode, and an always-on-top mini Pomodoro that stays in sync with the dashboard's timer.

**Architecture:** The pop-out note window reuses the main renderer bundle with a `?note=<id>` query param (`main.tsx` branches on it) rather than a whole second bundle — the exact pattern the design note asked for. Distraction-free mode is a pure renderer store flag that hides `TopBar`/`Sidebar`. The mini Pomodoro needs real architecture, not just UI: today's `Pomodoro` component owns its own local timer, so two of them (dashboard + mini) would drift apart. The timer moves into the main process as the single source of truth, broadcasting ticks to every window; `Pomodoro.tsx` becomes a thin view that displays that state and sends toggle/reset commands over IPC. The mini window is a small second renderer bundle (mirroring `capture.html`/`capture.tsx`) that renders the same `Pomodoro` component.

**Tech Stack:** Electron `BrowserWindow`, zustand, React. No new dependencies.

## Global Constraints

- No new npm dependencies.
- Follow the existing IPC pattern: entries in `src/main/ipc.ts`'s `handlers` map, mirrored in `src/preload/index.ts`'s `api`, typed in `src/preload/index.d.ts`'s `OrynApi`. Broadcast channels (not request/response) follow the existing `captures:changed`/`capture:opened` pattern in `capture.ts` and `preload/index.ts`.
- Window-creation code (`BrowserWindow`, `dialog`, etc.) is Electron-only and untested by the `npm test` node-script suite, matching `capture.ts`/`backup.ts`/`reminders.ts`/`attachments.ts` — verified by typecheck and (where this sandboxed shell allows) manual runs.
- **Deviation/clarification of the original one-line design note:** it said the mini Pomodoro and dashboard Pomodoro should "share timer state via the same IPC broadcast pattern `capture.ts` already uses." The existing `Pomodoro.tsx` has no shareable state to broadcast — it's a local `useState`/`useRef` timer per component instance. Sharing state means there can only be one timer, so this plan moves timer ownership into the main process (Task 3) rather than trying to synchronize two independent renderer timers after the fact.
- This plan touches `Pomodoro.tsx`'s internals but keeps its public props (`onLogged?`) and visual appearance unchanged for existing callers (`Dashboard.tsx` needs no edits).

---

### Task 1: Distraction-free writing mode

**Files:**
- Modify: `src/renderer/src/store.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/views/Notes.tsx`

**Interfaces:**
- Produces: `focusMode: boolean`, `setFocusMode(v: boolean): void` on the store.

- [ ] **Step 1: Add `focusMode` to the store**

In `src/renderer/src/store.ts`, add to the `State` interface after `locked: boolean`:

```ts
  /** Hides TopBar/Sidebar for distraction-free writing. Toggled from Notes, Escape exits. */
  focusMode: boolean
```

Add to the interface after `setLocked: (locked: boolean) => void`:

```ts
  setFocusMode: (v: boolean) => void
```

Add the default after `locked: false,`:

```ts
  focusMode: false,
```

Add the implementation after `setLocked: (locked) => set({ locked }),`:

```ts
  setFocusMode: (v) => set({ focusMode: v }),
```

- [ ] **Step 2: Gate `App.tsx` on `focusMode` and exit it on Escape**

In `src/renderer/src/App.tsx`, add `focusMode` and `setFocusMode` to the destructured store values:

```ts
  const {
    loadSpaces,
    activeView,
    activeSpaceId,
    setPalette,
    paletteOpen,
    sidebarOpen,
    locked,
    setLocked,
    focusMode,
    setFocusMode
  } = useStore()
```

Change the Escape handling in the `onKey` effect. Replace:

```ts
      if (e.key === 'Escape') setPalette(false)
```

with:

```ts
      if (e.key === 'Escape') {
        if (paletteOpen) setPalette(false)
        else if (focusMode) setFocusMode(false)
      }
```

Add `paletteOpen` and `focusMode`/`setFocusMode` to that effect's dependency array — change:

```ts
  }, [setPalette])
```

to:

```ts
  }, [setPalette, paletteOpen, focusMode, setFocusMode])
```

Hide `TopBar` and `Sidebar` while in focus mode. Replace:

```tsx
        <>
          <TopBar />
          <div className="flex min-h-0 flex-1">
            {sidebarOpen && <Sidebar />}
            <main className="flex min-w-0 flex-1">
```

with:

```tsx
        <>
          {!focusMode && <TopBar />}
          <div className="flex min-h-0 flex-1">
            {sidebarOpen && !focusMode && <Sidebar />}
            <main className="flex min-w-0 flex-1">
```

- [ ] **Step 3: Add the toggle button to the note header**

In `src/renderer/src/views/Notes.tsx`, add the import:

```ts
import { Maximize2Icon, Minimize2Icon } from 'lucide-react'
```

(add these two names to the existing `lucide-react` import line rather than a second import statement)

Add `focusMode`/`setFocusMode` to the store destructure at the top of `NotesView`:

```ts
  const { activeSpaceId, activeNoteId, setNote, spaces, theme, focusMode, setFocusMode } =
    useStore()
```

Add the toggle button in the note header, right before the "Move to space" `SimpleSelect`:

```tsx
              <button
                onClick={() => setFocusMode(!focusMode)}
                title={focusMode ? 'Exit focus mode' : 'Focus mode'}
                aria-label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
                className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted hover:border-accent hover:text-text"
              >
                {focusMode ? (
                  <Minimize2Icon className="size-4" />
                ) : (
                  <Maximize2Icon className="size-4" />
                )}
              </button>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Manual verification note**

Same limitation as every other UI task this session — no real Electron display session in this shell. When next running the app: open a note, click the focus-mode button, confirm the sidebar and top bar disappear; press Escape and confirm they return.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store.ts src/renderer/src/App.tsx src/renderer/src/views/Notes.tsx
git commit -m "Add distraction-free focus mode, toggled from Notes, Escape exits"
```

---

### Task 2: Pop-out note window

**Files:**
- Create: `src/main/popout.ts`
- Create: `src/renderer/src/PopoutNote.tsx`
- Modify: `src/renderer/src/main.tsx`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/renderer/src/views/Notes.tsx`

**Interfaces:**
- Produces: `popOutNote(noteId: number): void` (main), `window.oryn.window.popOutNote(noteId: number): Promise<void>` (renderer) — consumed by Notes.tsx.

- [ ] **Step 1: Implement `src/main/popout.ts`**

```ts
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
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { note: String(noteId) } })

  noteWindows.set(noteId, win)
  win.on('closed', () => noteWindows.delete(noteId))
}
```

- [ ] **Step 2: Renderer routing in `main.tsx`**

Create `src/renderer/src/PopoutNote.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { useStore } from './store'
import { Editor } from './components/Editor'
import type { Note } from '../../shared/types'

/**
 * A note opened in its own window, via popOutNote() / ?note=<id> — same
 * renderer bundle as the main shell, just a different root component. No
 * sidebar, no space switcher: just the title and the editor.
 */
export function PopoutNote({ noteId }: { noteId: number }): React.JSX.Element {
  const theme = useStore((s) => s.theme)
  const [note, setNote] = useState<Note | null>(null)

  const load = useCallback(async () => {
    setNote((await window.oryn.notes.get(noteId)) ?? null)
  }, [noteId])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(
    (contentJson: string, contentText: string) => {
      void window.oryn.notes.update(noteId, { contentJson, contentText })
    },
    [noteId]
  )

  const rename = async (title: string): Promise<void> => {
    if (!note) return
    setNote({ ...note, title })
    await window.oryn.notes.update(noteId, { title })
  }

  if (!note) return <div className="h-full bg-bg" />

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <div className="border-b border-border px-4 py-3">
        <input
          value={note.title}
          onChange={(e) => void rename(e.target.value)}
          placeholder="Untitled"
          className="w-full bg-transparent text-[20px] font-semibold tracking-tight outline-none placeholder:text-faint"
        />
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <Editor
          key={note.id}
          noteId={note.id}
          initialContent={note.content_json}
          theme={theme}
          onSave={save}
        />
      </div>
    </div>
  )
}
```

Replace `src/renderer/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { PopoutNote } from './PopoutNote'
import './styles.css'

const noteId = new URLSearchParams(window.location.search).get('note')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{noteId ? <PopoutNote noteId={Number(noteId)} /> : <App />}</StrictMode>
)
```

- [ ] **Step 3: Wire IPC and preload**

In `src/main/ipc.ts`, add the import:

```ts
import { popOutNote } from './popout'
```

Add to the `handlers` map, inside the existing `window:*` area (near where `'window:theme'` would conceptually sit — that one is actually registered separately in `index.ts`, so just add this one in the main `handlers` object):

```ts
  'window:popOutNote': popOutNote,
```

In `src/preload/index.ts`, find the existing `window` block:

```ts
  window: {
    setTheme: invoke('window:theme'),
    /** Scales the entire UI, editor and all, rather than any one font rule. */
    setZoom: (factor: number) => webFrame.setZoomFactor(factor)
  }
```

and add `popOutNote` to it:

```ts
  window: {
    setTheme: invoke('window:theme'),
    /** Scales the entire UI, editor and all, rather than any one font rule. */
    setZoom: (factor: number) => webFrame.setZoomFactor(factor),
    popOutNote: invoke('window:popOutNote')
  }
```

In `src/preload/index.d.ts`, find the `window` block in `OrynApi`:

```ts
  window: {
    /** Repaints the native min/max/close buttons to match the app theme. */
    setTheme(theme: 'dark' | 'light'): Promise<void>
    /** Scales the whole interface. 1 is 100%. */
    setZoom(factor: number): void
  }
```

and add:

```ts
  window: {
    /** Repaints the native min/max/close buttons to match the app theme. */
    setTheme(theme: 'dark' | 'light'): Promise<void>
    /** Scales the whole interface. 1 is 100%. */
    setZoom(factor: number): void
    popOutNote(noteId: number): Promise<void>
  }
```

- [ ] **Step 4: Add the trigger button in Notes.tsx**

Add `ExternalLinkIcon` to the existing `lucide-react` import line in `src/renderer/src/views/Notes.tsx` (alongside `Maximize2Icon`/`Minimize2Icon` from Task 1).

Add the button in the note header, right after the focus-mode button added in Task 1:

```tsx
              <button
                onClick={() => void window.oryn.window.popOutNote(note.id)}
                title="Open in a new window"
                aria-label="Open in a new window"
                className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted hover:border-accent hover:text-text"
              >
                <ExternalLinkIcon className="size-4" />
              </button>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 6: Manual verification note**

Same sandboxed-shell limitation. When next running the app: open a note, click "Open in a new window", confirm a second window opens showing that note's editor; edit in either window and confirm it saves (switching away and back in the main window reloads the updated content).

- [ ] **Step 7: Commit**

```bash
git add src/main/popout.ts src/renderer/src/PopoutNote.tsx src/renderer/src/main.tsx src/main/ipc.ts src/preload/index.ts src/preload/index.d.ts src/renderer/src/views/Notes.tsx
git commit -m "Add pop-out note window"
```

---

### Task 3: Move the Pomodoro timer into the main process

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/main/pomodoro.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Produces: shared type `PomodoroState { phase: 'focus' | 'break'; running: boolean; remaining: number }`; `getPomodoroState()`, `togglePomodoro()`, `resetPomodoro()`, `startPomodoroTicker(): () => void` (main); `window.oryn.pomodoro.{state,toggle,reset,onTick}` (renderer) — consumed by Task 4.

- [ ] **Step 1: Add the shared type**

Add at the end of `src/shared/types.ts`:

```ts
export interface PomodoroState {
  phase: 'focus' | 'break'
  running: boolean
  /** Seconds left in the current phase. */
  remaining: number
}
```

- [ ] **Step 2: Implement `src/main/pomodoro.ts`**

```ts
import { BrowserWindow } from 'electron'
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
```

- [ ] **Step 3: Start the ticker at app launch**

In `src/main/index.ts`, add the import:

```ts
import { startPomodoroTicker } from './pomodoro'
```

Add a module-scope variable alongside `stopReminders`:

```ts
/** Set once the Pomodoro ticker starts; cleared and called on quit. */
let stopPomodoroTicker: (() => void) | null = null
```

Inside `app.whenReady().then(() => { ... })`, alongside `stopReminders = startReminders(showMainWindow)`:

```ts
    stopPomodoroTicker = startPomodoroTicker()
```

In the `will-quit` handler, alongside `stopReminders?.()`:

```ts
  app.on('will-quit', () => {
    stopReminders?.()
    stopPomodoroTicker?.()
    globalShortcutCleanup()
    closeDb()
  })
```

- [ ] **Step 4: Wire IPC and preload**

In `src/main/ipc.ts`, add the import:

```ts
import { getPomodoroState, togglePomodoro, resetPomodoro } from './pomodoro'
```

Add to the `handlers` map:

```ts
  'pomodoro:state': getPomodoroState,
  'pomodoro:toggle': togglePomodoro,
  'pomodoro:reset': resetPomodoro,
```

In `src/preload/index.ts`, add a new top-level key (this file already imports `ipcRenderer` and `IpcRendererEvent` for the `captures`/`capture` broadcast pattern — reuse that):

```ts
  pomodoro: {
    state: invoke('pomodoro:state'),
    toggle: invoke('pomodoro:toggle'),
    reset: invoke('pomodoro:reset'),
    onTick: (cb: (state: import('../shared/types').PomodoroState) => void) => {
      const handler = (_e: IpcRendererEvent, state: import('../shared/types').PomodoroState): void =>
        cb(state)
      ipcRenderer.on('pomodoro:tick', handler)
      return () => ipcRenderer.removeListener('pomodoro:tick', handler)
    }
  },
```

In `src/preload/index.d.ts`, add `PomodoroState` to the type import, and a new block:

```ts
  PomodoroState
} from '../shared/types'
```

```ts
  pomodoro: {
    state(): Promise<PomodoroState>
    toggle(): Promise<PomodoroState>
    reset(): Promise<PomodoroState>
    /** Returns an unsubscribe function. */
    onTick(cb: (state: PomodoroState) => void): () => void
  }
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/pomodoro.ts src/main/index.ts src/main/ipc.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "Move the Pomodoro timer into the main process, broadcast ticks to every window"
```

---

### Task 4: Mini Pomodoro window

**Files:**
- Modify: `src/main/pomodoro.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Create: `src/renderer/pomodoro.html`
- Create: `src/renderer/src/pomodoro.tsx`
- Modify: `electron.vite.config.ts`

**Interfaces:**
- Consumes: `Pomodoro` component (unchanged from today — Task 5 rewrites it, after this task, to add the pop-out button this task's API makes possible) from `src/renderer/src/components/Pomodoro.tsx`; `getPomodoroState`/`togglePomodoro`/`resetPomodoro` wiring from Task 3.
- Produces: `openMiniPomodoro(): void` (main), `window.oryn.pomodoro.openMini(): Promise<void>` (renderer) — consumed by Task 5.

- [ ] **Step 1: Add the mini window to `src/main/pomodoro.ts`**

Add to the imports:

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
```

(replacing the existing `import { BrowserWindow } from 'electron'` line)

Add at the end of the file:

```ts
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
```

- [ ] **Step 2: Wire IPC and preload**

In `src/main/ipc.ts`, add `openMiniPomodoro` to the existing pomodoro import:

```ts
import { getPomodoroState, togglePomodoro, resetPomodoro, openMiniPomodoro } from './pomodoro'
```

Add to the `handlers` map, alongside the other `pomodoro:*` entries:

```ts
  'pomodoro:openMini': openMiniPomodoro,
```

In `src/preload/index.ts`, add `openMini` to the existing `pomodoro` block:

```ts
  pomodoro: {
    state: invoke('pomodoro:state'),
    toggle: invoke('pomodoro:toggle'),
    reset: invoke('pomodoro:reset'),
    openMini: invoke('pomodoro:openMini'),
    onTick: (cb: (state: import('../shared/types').PomodoroState) => void) => {
      const handler = (_e: IpcRendererEvent, state: import('../shared/types').PomodoroState): void =>
        cb(state)
      ipcRenderer.on('pomodoro:tick', handler)
      return () => ipcRenderer.removeListener('pomodoro:tick', handler)
    }
  },
```

In `src/preload/index.d.ts`, add to the `pomodoro` block:

```ts
  pomodoro: {
    state(): Promise<PomodoroState>
    toggle(): Promise<PomodoroState>
    reset(): Promise<PomodoroState>
    openMini(): Promise<void>
    /** Returns an unsubscribe function. */
    onTick(cb: (state: PomodoroState) => void): () => void
  }
```

- [ ] **Step 3: Create the mini renderer entry**

Create `src/renderer/pomodoro.html`:

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'"
    />
    <title>Oryn Pomodoro</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/pomodoro.tsx"></script>
  </body>
</html>
```

Create `src/renderer/src/pomodoro.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Pomodoro } from './components/Pomodoro'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="flex h-full items-center bg-bg p-2">
      <Pomodoro showPopOut={false} />
    </div>
  </StrictMode>
)
```

- [ ] **Step 4: Add the new entry to the Vite build**

In `electron.vite.config.ts`, update the renderer build's `rollupOptions.input`:

```ts
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          capture: resolve(__dirname, 'src/renderer/capture.html'),
          pomodoro: resolve(__dirname, 'src/renderer/pomodoro.html')
        }
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: passes — this also resolves Task 4's `openMini` reference.

- [ ] **Step 6: Manual verification note**

Same sandboxed-shell limitation. When next running the app: on the dashboard, click the Pomodoro row's pop-out (external-link) icon. Confirm a small frameless always-on-top window appears showing the same running clock; start/pause/reset in either window and confirm the other updates within half a second.

- [ ] **Step 7: Commit**

```bash
git add src/main/pomodoro.ts src/main/ipc.ts src/preload/index.ts src/preload/index.d.ts src/renderer/pomodoro.html src/renderer/src/pomodoro.tsx electron.vite.config.ts
git commit -m "Add the always-on-top mini Pomodoro window"
```

---

### Task 6: Final full-suite check

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass (this plan adds no new pure logic to unit-test — everything here is windowing/IPC/UI, same as the app-lock and attachments Electron-glue pieces), typecheck clean.

- [ ] **Step 2: No commit needed** — this task only verifies the tree left by Task 5 is green.
