import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { addDays, today } from '../../../shared/dates'
import type { ReviewSummary, HabitCorrelation } from '../../../shared/types'

type Period = 'week' | 'month'

const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30 }

function range(period: Period, end: string): { from: string; to: string } {
  return { from: addDays(end, -(PERIOD_DAYS[period] - 1)), to: end }
}

function Stat({
  label,
  value,
  delta
}: {
  label: string
  value: string | number
  delta?: number
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="text-[12px] uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-[20px] font-semibold tabular-nums">{value}</span>
        {delta !== undefined && delta !== 0 && (
          <span className={`text-[13px] ${delta > 0 ? 'text-success' : 'text-danger'}`}>
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        )}
      </div>
    </div>
  )
}

export function ReviewView(): React.JSX.Element {
  const { activeSpaceId } = useStore()
  const [period, setPeriod] = useState<Period>('week')
  const [current, setCurrent] = useState<ReviewSummary | null>(null)
  const [previous, setPrevious] = useState<ReviewSummary | null>(null)
  const [correlations, setCorrelations] = useState<HabitCorrelation[]>([])

  const load = useCallback(async () => {
    const day = today()
    const cur = range(period, day)
    const prevEnd = addDays(cur.from, -1)
    const prev = range(period, prevEnd)

    const [curSummary, prevSummary, corr] = await Promise.all([
      window.oryn.insights.review(cur.from, cur.to, activeSpaceId),
      window.oryn.insights.review(prev.from, prev.to, activeSpaceId),
      window.oryn.insights.correlations(cur.from, cur.to, activeSpaceId)
    ])
    setCurrent(curSummary)
    setPrevious(prevSummary)
    setCorrelations(corr)
  }, [period, activeSpaceId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">Review</h1>
          <div className="flex items-center gap-1">
            {(['week', 'month'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-2.5 py-1 text-[15px] transition-colors ${
                  period === p ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
                }`}
              >
                {p === 'week' ? 'This week' : 'This month'}
              </button>
            ))}
          </div>
        </div>

        {current && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Tasks completed"
              value={current.tasksCompleted}
              delta={previous ? current.tasksCompleted - previous.tasksCompleted : undefined}
            />
            <Stat
              label="Tasks created"
              value={current.tasksCreated}
              delta={previous ? current.tasksCreated - previous.tasksCreated : undefined}
            />
            <Stat
              label="Habit completion"
              value={`${current.habitCompletionPct}%`}
              delta={
                previous
                  ? Math.round((current.habitCompletionPct - previous.habitCompletionPct) * 10) /
                    10
                  : undefined
              }
            />
            <Stat
              label="Journal entries"
              value={current.journalEntries}
              delta={previous ? current.journalEntries - previous.journalEntries : undefined}
            />
          </div>
        )}

        {current?.busiestSpace && (
          <p className="mt-4 text-[15px] text-muted">
            Busiest space: <span className="text-text">{current.busiestSpace.name}</span>
          </p>
        )}

        {correlations.length > 0 && (
          <>
            <h2 className="mb-2 mt-6 text-[12px] font-medium uppercase tracking-wider text-faint">
              Habits that move together
            </h2>
            <div className="flex flex-col gap-1.5">
              {correlations.map((c, i) => (
                <div
                  key={i}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-[15px]"
                >
                  <span className="text-text">{c.habitA.name}</span>
                  <span className="text-faint"> & </span>
                  <span className="text-text">{c.habitB.name}</span>
                  <span className="ml-2 text-[13px] text-faint">
                    {Math.round(Math.abs(c.correlation) * 100)}%{' '}
                    {c.correlation > 0 ? 'together' : 'apart'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
