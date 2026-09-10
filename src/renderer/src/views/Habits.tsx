import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { HabitCheckin } from '../components/HabitCheckin'
import { SimpleSelect } from '../components/ui/simple-select'
import { PencilIcon, Trash2Icon } from 'lucide-react'
import { addDays, today } from '../../../shared/dates'
import type { HabitToday, HabitStats, HabitKind } from '../../../shared/types'

const STRIP_DAYS = 30

const FIELD =
  'rounded border border-border bg-bg px-1.5 py-1 text-[15px] text-muted outline-none focus:border-accent'

/** Palette offered when editing a habit's colour. */
const COLORS = ['#30a46c', '#4d7ea8', '#a855f7', '#f5a524', '#e5484d', '#14b8a6']

const KIND_OPTIONS = [
  { value: 'bool', label: 'Check off' },
  { value: 'count', label: 'Countable' }
]

interface Detail {
  stats: HabitStats
  history: Record<string, number>
}

/** Inline editor for a habit, including converting between the two kinds. */
function HabitEditor({
  habit,
  onDone
}: {
  habit: HabitToday
  onDone: () => void
}): React.JSX.Element {
  const { spaces } = useStore()
  const [name, setName] = useState(habit.name)
  const [kind, setKind] = useState<HabitKind>(habit.kind)
  const [target, setTarget] = useState(habit.target)
  const [unit, setUnit] = useState(habit.unit)
  const [color, setColor] = useState(habit.color)
  const [spaceId, setSpaceId] = useState(habit.space_id)

  const save = async (): Promise<void> => {
    const text = name.trim()
    if (!text) return
    await window.oryn.habits.update(habit.id, {
      name: text,
      kind,
      // A check-off habit always has a target of one, so switching kinds back
      // and forth cannot leave a stale target that blocks completion.
      target: kind === 'count' ? Math.max(1, target) : 1,
      unit: kind === 'count' ? unit.trim() : '',
      color,
      space_id: spaceId
    })
    onDone()
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') onDone()
        }}
        className="w-full bg-transparent text-[16px] font-medium outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <SimpleSelect
          value={kind}
          onChange={(v) => setKind(v as HabitKind)}
          options={KIND_OPTIONS}
          ariaLabel="Habit kind"
        />
        {kind === 'count' && (
          <>
            <input
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className={`${FIELD} w-16`}
            />
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="unit"
              className={`${FIELD} placeholder:text-faint`}
            />
          </>
        )}
        <SimpleSelect
          value={String(spaceId)}
          onChange={(v) => setSpaceId(Number(v))}
          options={spaces
            .filter((s) => !s.is_system)
            .map((s) => ({ value: String(s.id), label: s.name }))}
          ariaLabel="Space"
        />
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Use colour ${c}`}
              className={`size-5 rounded-full transition-transform ${
                color === c ? 'scale-110 ring-2 ring-text/40' : ''
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={onDone}
            className="rounded border border-border px-2 py-1 text-[15px] text-faint hover:text-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            className="rounded border border-accent bg-accent/15 px-2 py-1 text-[15px] text-accent"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export function HabitsView(): React.JSX.Element {
  const { activeSpaceId, spaces } = useStore()
  const day = today()
  const [habits, setHabits] = useState<HabitToday[]>([])
  const [details, setDetails] = useState<Record<number, Detail>>({})
  const [editing, setEditing] = useState<number | null>(null)

  const [name, setName] = useState('')
  const [kind, setKind] = useState<HabitKind>('bool')
  const [target, setTarget] = useState(1)
  const [unit, setUnit] = useState('')

  const refresh = useCallback(async () => {
    const rows = await window.oryn.habits.forDate(day, activeSpaceId)
    setHabits(rows)
    const from = addDays(day, -(STRIP_DAYS - 1))
    const loaded = await Promise.all(
      rows.map(async (h) => {
        const [stats, history] = await Promise.all([
          window.oryn.habits.stats(h.id, day),
          window.oryn.habits.history(h.id, from, day)
        ])
        return [h.id, { stats, history }] as const
      })
    )
    setDetails(Object.fromEntries(loaded))
  }, [activeSpaceId, day])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const add = async (): Promise<void> => {
    const text = name.trim()
    if (!text) return
    const space = activeSpaceId ?? spaces.find((s) => !s.is_system)?.id
    if (space == null) return
    await window.oryn.habits.create({
      spaceId: space,
      name: text,
      kind,
      target: kind === 'count' ? Math.max(1, target) : 1,
      unit: kind === 'count' ? unit.trim() : ''
    })
    setName('')
    setUnit('')
    setTarget(1)
    await refresh()
  }

  const remove = async (id: number, label: string): Promise<void> => {
    if (!confirm(`Delete "${label}" and all of its history?`)) return
    await window.oryn.habits.delete(id)
    await refresh()
  }

  const stripDates = Array.from({ length: STRIP_DAYS }, (_, i) =>
    addDays(day, -(STRIP_DAYS - 1 - i))
  )

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-5">
        <h1 className="mb-3 text-[22px] font-semibold tracking-tight">Habits</h1>

        <div className="mb-5 rounded-lg border border-border bg-surface p-3">
          <HabitCheckin habits={habits} date={day} onChanged={() => void refresh()} />
        </div>

        <div className="mb-5 rounded-lg border border-border bg-surface p-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            placeholder="New habit…"
            className="w-full bg-transparent px-1 py-1 text-[16px] outline-none placeholder:text-faint"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[15px]">
            <SimpleSelect
              value={kind}
              onChange={(v) => setKind(v as HabitKind)}
              options={KIND_OPTIONS}
              ariaLabel="Habit kind"
            />
            {kind === 'count' && (
              <>
                <input
                  type="number"
                  min={1}
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  className="w-16 rounded border border-border bg-bg px-1.5 py-1 text-muted outline-none focus:border-accent"
                />
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="unit, e.g. problems"
                  className="rounded border border-border bg-bg px-1.5 py-1 text-muted outline-none placeholder:text-faint focus:border-accent"
                />
              </>
            )}
            <button
              onClick={() => void add()}
              className="ml-auto rounded border border-border px-2 py-1 text-muted hover:border-accent hover:text-text"
            >
              Add habit
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {habits.map((h) => {
            const d = details[h.id]
            return (
              <div key={h.id} className="group rounded-lg border border-border bg-surface p-3">
                {editing === h.id ? (
                  <HabitEditor
                    habit={h}
                    onDone={() => {
                      setEditing(null)
                      void refresh()
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: h.color }} />
                    <span className="text-[16px] font-medium">{h.name}</span>
                    {h.kind === 'count' && (
                      <span className="text-[13px] text-faint">
                        target {h.target} {h.unit}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-3 text-[13px] text-faint">
                      <span>
                        streak <span className="text-text">{d?.stats.current_streak ?? 0}</span>
                      </span>
                      <span>
                        best <span className="text-text">{d?.stats.longest_streak ?? 0}</span>
                      </span>
                      <span>
                        days <span className="text-text">{d?.stats.days_done ?? 0}</span>
                      </span>
                      <button
                        onClick={() => setEditing(h.id)}
                        className="opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
                        aria-label={`Edit ${h.name}`}
                        title="Edit"
                      >
                        <PencilIcon className="size-4" />
                      </button>
                      <button
                        onClick={() => void remove(h.id, h.name)}
                        className="opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                        aria-label={`Delete ${h.name}`}
                        title="Delete"
                      >
                        <Trash2Icon className="size-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-2 flex gap-[3px]">
                  {stripDates.map((date) => {
                    const value = d?.history[date] ?? 0
                    const met = value >= h.target
                    return (
                      <span
                        key={date}
                        title={`${date}${value ? ` · ${value}` : ''}`}
                        className="h-5 flex-1 rounded-[3px]"
                        style={{
                          background: met
                            ? h.color
                            : value > 0
                              ? `${h.color}55`
                              : 'var(--color-surface-2)'
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
