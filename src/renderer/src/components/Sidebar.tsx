import { useEffect, useState } from 'react'
import { useStore, type View } from '../store'
import { PlusIcon } from 'lucide-react'

const SECONDARY: { id: View; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'planner', label: 'Planner' },
  { id: 'review', label: 'Review' },
  { id: 'archive', label: 'Archive' },
  { id: 'settings', label: 'Settings' }
]

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
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[16px] transition-colors ${
        active ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2/60 hover:text-text'
      }`}
    >
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: color ?? 'var(--color-faint)' }}
      />
      <span className="truncate">{label}</span>
    </button>
  )
}

export function Sidebar(): React.JSX.Element {
  const { spaces, activeSpaceId, setSpace, activeView, setView } = useStore()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [inbox, setInbox] = useState(0)

  // The count comes from the popup window too, so it listens rather than polls.
  useEffect(() => {
    const load = (): void => void window.oryn.captures.count().then(setInbox)
    load()
    return window.oryn.captures.onChanged(load)
  }, [activeView])

  const create = async (): Promise<void> => {
    const text = name.trim()
    if (text) {
      const space = await window.oryn.spaces.create({ name: text })
      await useStore.getState().loadSpaces()
      setSpace(space.id)
    }
    setName('')
    setAdding(false)
  }

  return (
    <aside className="select-none-ui flex w-52 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex flex-col gap-0.5 px-2 pt-3">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[13px] font-medium uppercase tracking-wider text-faint">
            Spaces
          </span>
          <button
            onClick={() => setAdding(true)}
            className="text-[17px] leading-none text-faint hover:text-text"
            aria-label="New space"
          >
            +
          </button>
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

        {adding && (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void create()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create()
              if (e.key === 'Escape') {
                setName('')
                setAdding(false)
              }
            }}
            placeholder="Space name…"
            className="mx-2 mt-1 rounded border border-border bg-bg px-2 py-1 text-[16px] outline-none placeholder:text-faint focus:border-accent"
          />
        )}
      </div>

      <div className="mt-auto flex flex-col gap-0.5 p-2">
        {SECONDARY.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-[16px] transition-colors ${
              activeView === item.id
                ? 'bg-surface-2 text-text'
                : 'text-faint hover:bg-surface-2/60 hover:text-muted'
            }`}
          >
            <span className="truncate">{item.label}</span>
            {item.id === 'inbox' && inbox > 0 && (
              <span className="ml-auto rounded-full bg-accent/20 px-1.5 text-[13px] tabular-nums text-accent">
                {inbox}
              </span>
            )}
          </button>
        ))}
      </div>
    </aside>
  )
}
