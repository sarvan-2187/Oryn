import { create } from 'zustand'
import type { Space } from '../../shared/types'

export type View =
  | 'dashboard'
  | 'notes'
  | 'tasks'
  | 'board'
  | 'habits'
  | 'activity'
  | 'review'
  | 'planner'
  | 'inbox'
  | 'settings'
  | 'archive'

interface State {
  spaces: Space[]
  /** null means "All spaces". */
  activeSpaceId: number | null
  activeView: View
  activeNoteId: number | null
  /** Set when a search result should be scrolled to and highlighted once the target view mounts. */
  focusTaskId: number | null
  focusHabitId: number | null
  theme: 'dark' | 'light'
  paletteOpen: boolean
  sidebarOpen: boolean
  /** True hides the whole app behind LockScreen. Defaults false; App.tsx flips
   *  it true on mount if a PIN turns out to be set, so most users (no PIN)
   *  never see a flash of the lock screen. */
  locked: boolean
  /** UI scale. 1 is 100%; clamped so the app can never become unusable. */
  zoom: number

  loadSpaces: () => Promise<void>
  setSpace: (id: number | null) => void
  setView: (v: View) => void
  setNote: (id: number | null) => void
  setFocusTaskId: (id: number | null) => void
  setFocusHabitId: (id: number | null) => void
  toggleTheme: () => void
  setPalette: (open: boolean) => void
  toggleSidebar: () => void
  setLocked: (locked: boolean) => void
  setZoom: (factor: number) => void
  nudgeZoom: (delta: number) => void
}

const ZOOM_MIN = 0.8
const ZOOM_MAX = 1.6

function applyZoom(factor: number): void {
  localStorage.setItem('oryn.zoom', String(factor))
  window.oryn?.window?.setZoom(factor)
}

function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.classList.toggle('light', theme === 'light')
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem('oryn.theme', theme)
  // The native window buttons are painted by the OS, so they need telling too.
  void window.oryn?.window?.setTheme(theme)
}

const startTheme = (localStorage.getItem('oryn.theme') as 'dark' | 'light' | null) ?? 'dark'
applyTheme(startTheme)

const startSidebar = localStorage.getItem('oryn.sidebar') !== 'closed'

const startZoom = Number(localStorage.getItem('oryn.zoom') ?? '1') || 1
applyZoom(startZoom)

export const useStore = create<State>((set, get) => ({
  spaces: [],
  activeSpaceId: null,
  activeView: 'dashboard',
  activeNoteId: null,
  focusTaskId: null,
  focusHabitId: null,
  theme: startTheme,
  paletteOpen: false,
  sidebarOpen: startSidebar,
  locked: false,
  zoom: startZoom,

  loadSpaces: async () => set({ spaces: await window.oryn.spaces.list() }),
  setSpace: (id) => set({ activeSpaceId: id, activeNoteId: null }),
  setView: (v) => set({ activeView: v, activeNoteId: null }),
  setNote: (id) => set({ activeNoteId: id }),
  setFocusTaskId: (id) => set({ focusTaskId: id }),
  setFocusHabitId: (id) => set({ focusHabitId: id }),
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    set({ theme: next })
  },
  setPalette: (open) => set({ paletteOpen: open }),
  toggleSidebar: () => {
    const next = !get().sidebarOpen
    localStorage.setItem('oryn.sidebar', next ? 'open' : 'closed')
    set({ sidebarOpen: next })
  },
  setLocked: (locked) => set({ locked }),
  setZoom: (factor) => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(factor.toFixed(2))))
    applyZoom(next)
    set({ zoom: next })
  },
  nudgeZoom: (delta) => get().setZoom(get().zoom + delta)
}))
