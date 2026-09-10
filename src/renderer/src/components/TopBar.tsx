import { MinusIcon, MoonIcon, PanelLeftIcon, PlusIcon, SearchIcon, SunIcon } from 'lucide-react'
import { useStore, type View } from '../store'
import icon from '../assets/icon.svg'

/** Must match TITLEBAR_HEIGHT in src/main/index.ts. */
export const TITLEBAR_HEIGHT = 40

/**
 * Reserved strip on the right for the native min/max/close buttons that
 * Windows draws over the page. Anything placed under it is unclickable.
 */
const WINDOW_CONTROLS_WIDTH = 138

const VIEWS: { id: View; label: string }[] = [
  { id: 'dashboard', label: 'Today' },
  { id: 'notes', label: 'Notes' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'habits', label: 'Habits' }
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
  const {
    activeView,
    setView,
    theme,
    toggleTheme,
    setPalette,
    sidebarOpen,
    toggleSidebar,
    zoom,
    setZoom,
    nudgeZoom
  } = useStore()

  return (
    <header
      // The whole bar drags the window; interactive children opt back out.
      style={{ height: TITLEBAR_HEIGHT, WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="select-none-ui relative flex shrink-0 items-center border-b border-border bg-surface px-2"
    >
      <div
        className="flex items-center gap-1"
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

      {/* Centred on the window rather than in the flex flow, so it stays put
          as the left and right clusters change width. */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <nav className="flex items-center gap-0.5 rounded-full border border-border bg-bg p-0.5">
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
        className="ml-auto flex items-center gap-1"
        style={
          { WebkitAppRegion: 'no-drag', marginRight: WINDOW_CONTROLS_WIDTH } as React.CSSProperties
        }
      >
        <button
          onClick={() => setPalette(true)}
          className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-[15px] text-faint transition-colors hover:border-accent hover:text-muted"
        >
          <SearchIcon className="size-4" />
          <span>Search</span>
          <kbd className="font-mono text-[12px]">Ctrl K</kbd>
        </button>

        <div className="flex items-center rounded-md border border-border">
          <button
            onClick={() => nudgeZoom(-0.1)}
            aria-label="Smaller text"
            title="Smaller text (Ctrl -)"
            className="grid size-7 place-items-center text-faint hover:text-text"
          >
            <MinusIcon className="size-4" />
          </button>
          <button
            onClick={() => setZoom(1)}
            title="Reset size (Ctrl 0)"
            className="min-w-[46px] px-1 py-1 font-mono text-[12px] tabular-nums text-faint hover:text-text"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => nudgeZoom(0.1)}
            aria-label="Larger text"
            title="Larger text (Ctrl +)"
            className="grid size-7 place-items-center text-faint hover:text-text"
          >
            <PlusIcon className="size-4" />
          </button>
        </div>

        <IconButton
          label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? (
            <SunIcon className="size-4.5" />
          ) : (
            <MoonIcon className="size-4.5" />
          )}
        </IconButton>
      </div>
    </header>
  )
}
