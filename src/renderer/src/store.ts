import { create } from 'zustand'
import type { Space } from '../../shared/types'

export type View = 'notes' | 'archive'

interface State {
  spaces: Space[]
  /** null means "All spaces". */
  activeSpaceId: number | null
  activeView: View
  activeNoteId: number | null
  theme: 'dark' | 'light'
  paletteOpen: boolean

  loadSpaces: () => Promise<void>
  setSpace: (id: number | null) => void
  setView: (v: View) => void
  setNote: (id: number | null) => void
  toggleTheme: () => void
  setPalette: (open: boolean) => void
}

function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.classList.toggle('light', theme === 'light')
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem('oryn.theme', theme)
}

const startTheme = (localStorage.getItem('oryn.theme') as 'dark' | 'light' | null) ?? 'dark'
applyTheme(startTheme)

export const useStore = create<State>((set, get) => ({
  spaces: [],
  activeSpaceId: null,
  activeView: 'notes',
  activeNoteId: null,
  theme: startTheme,
  paletteOpen: false,

  loadSpaces: async () => set({ spaces: await window.oryn.spaces.list() }),
  setSpace: (id) => set({ activeSpaceId: id, activeNoteId: null }),
  setView: (v) => set({ activeView: v, activeNoteId: null }),
  setNote: (id) => set({ activeNoteId: id }),
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    set({ theme: next })
  },
  setPalette: (open) => set({ paletteOpen: open })
}))
