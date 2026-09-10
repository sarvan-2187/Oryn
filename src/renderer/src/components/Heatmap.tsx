import { useMemo } from 'react'
import { addDays, fromDateStr } from '../../../shared/dates'

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Props {
  from: string
  to: string
  history: Record<string, number>
  color: string
  /** Rendered into each square's tooltip after the count. */
  unit?: string
  onSelect?: (date: string) => void
}

/**
 * GitHub-style contribution grid: one column per week, Sunday at the top.
 *
 * Intensity is bucketed against the period's own maximum rather than a fixed
 * scale, so the grid stays readable whether a busy day means two habits or
 * ninety focus minutes.
 */
export function Heatmap({ from, to, history, color, unit, onSelect }: Props): React.JSX.Element {
  const { weeks, monthMarks, max } = useMemo(() => {
    // Back up to the Sunday on or before `from` so every column is a full week.
    let cursor = from
    while (fromDateStr(cursor).getDay() !== 0) cursor = addDays(cursor, -1)

    const cols: string[][] = []
    const marks: { col: number; label: string }[] = []
    let lastMonth = -1

    while (cursor <= to) {
      const week: string[] = []
      for (let i = 0; i < 7; i++) {
        week.push(cursor)
        cursor = addDays(cursor, 1)
      }
      const month = fromDateStr(week[0]).getMonth()
      const lastCol = marks.length > 0 ? marks[marks.length - 1].col : -99
      // A label is about three columns wide, so two months starting closer
      // than that would run together, as "Aug" and "Sep" did.
      if (month !== lastMonth && cols.length - lastCol >= 3) {
        marks.push({ col: cols.length, label: MONTHS[month] })
      }
      if (month !== lastMonth) lastMonth = month
      cols.push(week)
    }

    const values = Object.values(history)
    return {
      weeks: cols,
      monthMarks: marks,
      max: values.length ? Math.max(...values) : 0
    }
  }, [from, to, history])

  const level = (value: number): number => {
    if (!value || max === 0) return 0
    return Math.min(4, Math.ceil((value / max) * 4))
  }

  const OPACITY = [0, 0.28, 0.5, 0.74, 1]

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          <div className="flex gap-[3px] pl-9 text-[12px] text-faint">
            {weeks.map((_, col) => {
              const mark = monthMarks.find((m) => m.col === col)
              return (
                <span key={col} className="w-3 shrink-0 whitespace-nowrap">
                  {mark ? mark.label : ''}
                </span>
              )
            })}
          </div>

          <div className="mt-1 flex gap-[3px]">
            <div className="flex w-8 shrink-0 flex-col gap-[3px] pr-1 text-right text-[11px] text-faint">
              {WEEKDAY_LABELS.map((label, i) => (
                <span key={i} className="h-3 leading-3">
                  {label}
                </span>
              ))}
            </div>

            {weeks.map((week, col) => (
              <div key={col} className="flex flex-col gap-[3px]">
                {week.map((date) => {
                  const value = history[date] ?? 0
                  const future = date > to
                  const lv = level(value)
                  return (
                    <button
                      key={date}
                      disabled={future}
                      onClick={() => onSelect?.(date)}
                      title={
                        future
                          ? ''
                          : `${date} · ${value}${unit ? ` ${unit}` : value === 1 ? '' : ''}`
                      }
                      aria-label={`${date}: ${value}`}
                      className="size-3 shrink-0 rounded-[2px] transition-transform hover:scale-125 disabled:opacity-0"
                      style={{
                        background: lv === 0 ? 'var(--color-surface-2)' : color,
                        opacity: lv === 0 ? 1 : OPACITY[lv]
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Outside the scroller: inside it, the right edge was clipped along
          with the grid whenever the weeks overflowed. */}
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[13px] text-faint">
        <span>Less</span>
        {OPACITY.map((o, i) => (
          <span
            key={i}
            className="size-3 rounded-[2px]"
            style={{
              background: i === 0 ? 'var(--color-surface-2)' : color,
              opacity: i === 0 ? 1 : o
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
