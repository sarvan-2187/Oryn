import { PanelLeftIcon, SearchIcon } from 'lucide-react'
import { useStore, type View } from '../store'
import icon from '../assets/icon.svg'

/** Must match TITLEBAR_HEIGHT in src/main/index.ts. */
export const TITLEBAR_HEIGHT = 46

/**
 * Reserved strip on the right for the native min/max/close buttons that
 * Windows draws over the page. Anything placed under it is unclickable.
 */
const WINDOW_CONTROLS_WIDTH = 138

const VIEWS: { id: View; label: string }[] = [
  { id: 'dashboard', label: 'Today' },
  { id: 'notes', label: 'Notes' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'board', label: 'Board' },
  { id: 'habits', label: 'Habits' },
  { id: 'activity', label: 'Activity' }
]

function IconButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      {children}
    </button>
  )
}

export function TopBar(): React.JSX.Element {
  const { activeView, setView, setPalette, sidebarOpen, toggleSidebar } = useStore()

  return (
    <header
      // The whole bar drags the window; interactive children opt back out.
      style={{ height: TITLEBAR_HEIGHT, WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="select-none-ui flex shrink-0 items-center gap-2 border-b border-border bg-surface px-2"
    >
      <div
        className="flex flex-1 items-center gap-1 overflow-hidden"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <IconButton label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} onClick={toggleSidebar}>
          <PanelLeftIcon className="size-4.5" />
        </IconButton>

        <div className="ml-1 flex items-center gap-2 pr-2">
          <img src={icon} alt="" className="size-6 rounded" />
          <span className="text-[16px] font-semibold tracking-tight">Oryn</span>
        </div>
      </div>

      {/* Kept in the flex flow between the two clusters. Absolute centring
          looked tidier with four views but overlapped the search box at six. */}
      <div className="shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <nav className="flex items-center gap-0.5 rounded-full border border-border bg-bg p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`rounded-full px-3.5 py-1 text-[15px] font-medium transition-colors ${
                activeView === v.id
                  ? 'bg-surface-2 text-text shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              {v.label}
            </button>
          ))}
        </nav>
      </div>

      <div
        className="flex flex-1 items-center justify-end gap-1 overflow-hidden"
        style={
          { WebkitAppRegion: 'no-drag', marginRight: WINDOW_CONTROLS_WIDTH } as React.CSSProperties
        }
      >
        <button
          onClick={() => setPalette(true)}
          className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-[15px] text-faint transition-colors hover:border-accent hover:text-muted"
        >
          <SearchIcon className="size-4" />
          <span className="hidden lg:inline">Search</span>
          <kbd className="hidden font-mono text-[12px] xl:inline">Ctrl K</kbd>
        </button>

      </div>
    </header>
  )
}
