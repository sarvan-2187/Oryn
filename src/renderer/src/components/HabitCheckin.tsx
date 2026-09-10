import { MinusIcon, PlusIcon } from 'lucide-react'
import type { HabitToday } from '../../../shared/types'

interface Props {
  habits: HabitToday[]
  date: string
  onChanged: () => void
}

/**
 * The daily check-in row, shared by the dashboard and the habits page.
 * Check-off habits are a single tap; countable habits step up and down.
 */
export function HabitCheckin({ habits, date, onChanged }: Props): React.JSX.Element {
  const toggle = async (id: number): Promise<void> => {
    await window.oryn.habits.toggle(id, date)
    onChanged()
  }

  const step = async (h: HabitToday, delta: number): Promise<void> => {
    await window.oryn.habits.setValue(h.id, date, Math.max(0, h.value + delta))
    onChanged()
  }

  if (habits.length === 0) {
    return <p className="px-3 py-6 text-center text-[16px] text-faint">No habits yet.</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {habits.map((h) =>
        h.kind === 'bool' ? (
          <button
            key={h.id}
            onClick={() => void toggle(h.id)}
            className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[16px] transition-colors"
            style={{
              borderColor: h.done ? h.color : 'var(--color-border)',
              background: h.done ? `${h.color}22` : 'transparent',
              color: h.done ? h.color : 'var(--color-muted)'
            }}
          >
            <span
              className="grid size-4 place-items-center rounded-full border"
              style={{ borderColor: h.done ? h.color : 'var(--color-border)' }}
            >
              {h.done && <span className="size-2 rounded-full" style={{ background: h.color }} />}
            </span>
            {h.name}
          </button>
        ) : (
          <div
            key={h.id}
            className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[16px]"
            style={{
              borderColor: h.done ? h.color : 'var(--color-border)',
              background: h.done ? `${h.color}22` : 'transparent'
            }}
          >
            <span style={{ color: h.done ? h.color : 'var(--color-muted)' }}>{h.name}</span>
            <span className="flex items-center gap-1.5">
              <button
                onClick={() => void step(h, -1)}
                className="text-faint hover:text-text"
                aria-label={`Decrease ${h.name}`}
              >
                <MinusIcon className="size-4" />
              </button>
              <span className="font-mono text-[15px] tabular-nums" style={{ color: h.color }}>
                {h.value}/{h.target}
              </span>
              <button
                onClick={() => void step(h, 1)}
                className="text-faint hover:text-text"
                aria-label={`Increase ${h.name}`}
              >
                <PlusIcon className="size-4" />
              </button>
            </span>
            {h.unit && <span className="text-[13px] text-faint">{h.unit}</span>}
          </div>
        )
      )}
    </div>
  )
}
