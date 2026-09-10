import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { Heatmap } from '../components/Heatmap'
import { SimpleSelect } from '../components/ui/simple-select'
import { fromDateStr } from '../../../shared/dates'
import type { ActivityMetric, ActivityResult, Habit } from '../../../shared/types'

/** Encoded as strings so the whole metric fits in one dropdown value. */
function decode(value: string): ActivityMetric {
  const [kind, id] = value.split(':')
  if (kind === 'habit') return { kind: 'habit', habitId: Number(id) }
  if (kind === 'space') return { kind: 'space', spaceId: Number(id) }
  return { kind: kind as 'all' | 'tasks' | 'notes' | 'focus' }
}

function Stat({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="text-[12px] uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-0.5 text-[20px] font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export function ActivityView(): React.JSX.Element {
  const { spaces } = useStore()
  const [metric, setMetric] = useState('all')
  const [habits, setHabits] = useState<Habit[]>([])
  const [data, setData] = useState<ActivityResult | null>(null)

  useEffect(() => {
    void window.oryn.habits.list(null).then(setHabits)
  }, [])

  const load = useCallback(async () => {
    setData(await window.oryn.stats.activity(decode(metric)))
  }, [metric])

  useEffect(() => {
    void load()
  }, [load])

  const options = useMemo(
    () => [
      { value: 'all', label: 'Everything' },
      { value: 'tasks', label: 'Tasks completed' },
      { value: 'notes', label: 'Notes written' },
      { value: 'focus', label: 'Focus minutes' },
      ...habits.map((h) => ({ value: `habit:${h.id}`, label: `Habit · ${h.name}` })),
      ...spaces
        .filter((s) => !s.is_system)
        .map((s) => ({ value: `space:${s.id}`, label: `Space · ${s.name}` }))
    ],
    [habits, spaces]
  )

  // The grid borrows the habit's or space's own colour so the metric is obvious.
  const color = useMemo(() => {
    const m = decode(metric)
    if (m.kind === 'habit')
      return habits.find((h) => h.id === m.habitId)?.color ?? 'var(--color-accent)'
    if (m.kind === 'space')
      return spaces.find((s) => s.id === m.spaceId)?.color ?? 'var(--color-accent)'
    return 'var(--color-accent)'
  }, [metric, habits, spaces])

  const unit = metric === 'focus' ? 'min' : undefined

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">Activity</h1>
          <SimpleSelect
            value={metric}
            onChange={setMetric}
            options={options}
            ariaLabel="Metric"
            className="ml-auto"
          />
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          {data ? (
            <Heatmap
              from={data.from}
              to={data.to}
              history={data.history}
              color={color}
              unit={unit}
            />
          ) : (
            <p className="py-10 text-center text-[14px] text-faint">Loading…</p>
          )}
        </div>

        {data && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Current streak" value={`${data.current_streak}d`} />
            <Stat label="Longest streak" value={`${data.longest_streak}d`} />
            <Stat label="Active days" value={data.active_days} />
            <Stat label={metric === 'focus' ? 'Total minutes' : 'Total'} value={data.total} />
          </div>
        )}

        {data?.best_day && (
          <p className="mt-3 text-[14px] text-faint">
            Busiest day was{' '}
            <span className="text-text">
              {fromDateStr(data.best_day).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
              })}
            </span>{' '}
            with {data.best_value}
            {unit ? ` ${unit}` : ''}.
          </p>
        )}
      </div>
    </div>
  )
}
