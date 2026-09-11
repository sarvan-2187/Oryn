import { useEffect } from 'react'
import { useStore } from './store'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { CommandPalette } from './components/CommandPalette'
import { ConfirmDialog } from './components/ConfirmDialog'
import { LockScreen } from './components/LockScreen'
import { DashboardView } from './views/Dashboard'
import { NotesView } from './views/Notes'
import { TasksView } from './views/Tasks'
import { BoardView } from './views/Board'
import { HabitsView } from './views/Habits'
import { ActivityView } from './views/Activity'
import { ReviewView } from './views/Review'
import { PlannerView } from './views/Planner'
import { InboxView } from './views/Inbox'
import { SettingsView } from './views/Settings'

export default function App(): React.JSX.Element {
  const { loadSpaces, activeView, activeSpaceId, setPalette, paletteOpen, sidebarOpen, locked, setLocked } =
    useStore()

  useEffect(() => {
    void loadSpaces()
  }, [loadSpaces])

  useEffect(() => {
    void window.oryn.lock.isSet().then((set) => {
      if (set) setLocked(true)
    })
  }, [setLocked])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(!useStore.getState().paletteOpen)
      }
      if (e.key === 'Escape') setPalette(false)

      // Ctrl +/-/0 scales the interface, as in a browser.
      if (e.ctrlKey || e.metaKey) {
        const { nudgeZoom, setZoom } = useStore.getState()
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          nudgeZoom(0.1)
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          nudgeZoom(-0.1)
        } else if (e.key === '0') {
          e.preventDefault()
          setZoom(1)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPalette])

  // Views are keyed by space so switching space refetches rather than showing
  // the previous space's rows until the next render settles.
  const key = `${activeView}-${activeSpaceId ?? 'all'}`

  return (
    <div className="flex h-full flex-col">
      {locked ? (
        <LockScreen />
      ) : (
        <>
          <TopBar />
          <div className="flex min-h-0 flex-1">
            {sidebarOpen && <Sidebar />}
            <main className="flex min-w-0 flex-1">
              {activeView === 'dashboard' && <DashboardView key={key} />}
              {activeView === 'notes' && <NotesView key={key} archived={false} />}
              {activeView === 'archive' && <NotesView key={key} archived />}
              {activeView === 'tasks' && <TasksView key={key} />}
              {activeView === 'board' && <BoardView key={key} />}
              {activeView === 'habits' && <HabitsView key={key} />}
              {activeView === 'activity' && <ActivityView key={key} />}
              {activeView === 'review' && <ReviewView key={key} />}
              {activeView === 'planner' && <PlannerView key={key} />}
              {activeView === 'inbox' && <InboxView key={key} />}
              {activeView === 'settings' && <SettingsView key={key} />}
            </main>
          </div>
          {paletteOpen && <CommandPalette />}
        </>
      )}
      <ConfirmDialog />
    </div>
  )
}
