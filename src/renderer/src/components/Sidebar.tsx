import { useState } from 'react'
import { useStore } from '../store'
import { PlusIcon } from 'lucide-react'

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

      <div className="mt-auto p-2">
        <button
          onClick={() => setView('archive')}
          className={`w-full rounded-md px-2 py-1.5 text-left text-[16px] transition-colors ${
            activeView === 'archive' ? 'bg-surface-2 text-text' : 'text-faint hover:text-muted'
          }`}
        >
          Archive
        </button>
      </div>
    </aside>
  )
}
