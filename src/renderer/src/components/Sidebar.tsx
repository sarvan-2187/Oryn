import { useStore } from '../store'
import icon from '../assets/icon.svg'

function Row({
  active,
  color,
  label,
  onClick
}: {
  active: boolean
  color?: string
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
        active ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface hover:text-text'
      }`}
    >
      {color ? (
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      ) : (
        <span className="size-2 shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </button>
  )
}

export function Sidebar(): React.JSX.Element {
  const { spaces, activeSpaceId, setSpace, activeView, setView, theme, toggleTheme, setPalette } =
    useStore()

  return (
    <aside className="select-none-ui flex w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 px-3 py-3">
        <img src={icon} alt="" className="size-6 rounded-md" />
        <span className="text-[15px] font-semibold tracking-tight">Oryn</span>
      </div>

      <button
        onClick={() => setPalette(true)}
        className="mx-2 mb-3 flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-[13px] text-faint hover:text-muted"
      >
        <span>Search…</span>
        <kbd className="font-mono text-[11px]">Ctrl K</kbd>
      </button>

      <nav className="flex flex-col gap-0.5 px-2">
        <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-faint">
          Spaces
        </div>
        <Row label="All" active={activeSpaceId === null} onClick={() => setSpace(null)} />
        {spaces
          .filter((s) => !s.is_system)
          .map((s) => (
            <Row
              key={s.id}
              label={s.name}
              color={s.color}
              active={activeSpaceId === s.id}
              onClick={() => setSpace(s.id)}
            />
          ))}
      </nav>

      <nav className="mt-4 flex flex-col gap-0.5 px-2">
        <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint">
          Views
        </div>
        <Row label="Notes" active={activeView === 'notes'} onClick={() => setView('notes')} />
        <Row label="Archive" active={activeView === 'archive'} onClick={() => setView('archive')} />
      </nav>

      <div className="mt-auto p-2">
        <button
          onClick={toggleTheme}
          className="w-full rounded-md px-2 py-1.5 text-left text-[13px] text-faint hover:bg-surface-2 hover:text-muted"
        >
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
      </div>
    </aside>
  )
}
