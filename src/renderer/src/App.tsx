import { useEffect } from 'react'
import { useStore } from './store'
import { Sidebar } from './components/Sidebar'
import { CommandPalette } from './components/CommandPalette'
import { NotesView } from './views/Notes'

export default function App(): React.JSX.Element {
  const { loadSpaces, activeView, setPalette, paletteOpen } = useStore()

  useEffect(() => {
    void loadSpaces()
  }, [loadSpaces])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(!useStore.getState().paletteOpen)
      }
      if (e.key === 'Escape') setPalette(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPalette])

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1">
        <NotesView key={activeView} archived={activeView === 'archive'} />
      </main>
      {paletteOpen && <CommandPalette />}
    </div>
  )
}
