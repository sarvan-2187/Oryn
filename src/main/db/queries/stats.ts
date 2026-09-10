import { getDb } from '../connection'
import { addDays, today } from '../../../shared/dates'
import type { ActivityMetric, ActivityResult } from '../../../shared/types'

export type { ActivityMetric, ActivityResult }

/**
 * Daily activity for the heatmap.
 *
 * There is no activity table: every metric is derived from the rows that
 * already exist, so nothing can drift out of sync with what actually happened.
 * Timestamps are stored in UTC, so day grouping converts to local time first,
 * otherwise anything done late in the evening lands on the wrong square.
 */
function historyFor(metric: ActivityMetric, from: string, to: string): Record<string, number> {
  const db = getDb()
  const range = 'WHERE d BETWEEN ? AND ?'
  let sql: string
  const params: unknown[] = []

  switch (metric.kind) {
    case 'habit':
      sql = `SELECT date AS d, SUM(value) AS n FROM habit_entries WHERE habit_id = ? GROUP BY d`
      params.push(metric.habitId)
      return run(`SELECT d, n FROM (${sql}) ${range}`, [...params, from, to])

    case 'tasks':
      sql = `SELECT date(completed_at, 'localtime') AS d, COUNT(*) AS n
             FROM tasks WHERE completed_at IS NOT NULL GROUP BY d`
      return run(`SELECT d, n FROM (${sql}) ${range}`, [from, to])

    case 'notes':
      sql = `SELECT date(created_at, 'localtime') AS d, COUNT(*) AS n FROM notes GROUP BY d`
      return run(`SELECT d, n FROM (${sql}) ${range}`, [from, to])

    case 'focus':
      sql = `SELECT date AS d, SUM(minutes) AS n FROM focus_sessions GROUP BY d`
      return run(`SELECT d, n FROM (${sql}) ${range}`, [from, to])

    case 'space':
      sql = `
        SELECT d, SUM(n) AS n FROM (
          SELECT e.date AS d, COUNT(*) AS n
            FROM habit_entries e JOIN habits h ON h.id = e.habit_id
            WHERE h.space_id = ? GROUP BY d
          UNION ALL
          SELECT date(completed_at, 'localtime') AS d, COUNT(*) AS n
            FROM tasks WHERE completed_at IS NOT NULL AND space_id = ? GROUP BY d
          UNION ALL
          SELECT date(created_at, 'localtime') AS d, COUNT(*) AS n
            FROM notes WHERE space_id = ? GROUP BY d
        ) GROUP BY d`
      return run(`SELECT d, n FROM (${sql}) ${range}`, [
        metric.spaceId,
        metric.spaceId,
        metric.spaceId,
        from,
        to
      ])

    default:
      // Everything: one point per habit check, task completed, note written and
      // focus session, so a busy day reads darker than a quiet one.
      sql = `
        SELECT d, SUM(n) AS n FROM (
          SELECT date AS d, COUNT(*) AS n FROM habit_entries GROUP BY d
          UNION ALL
          SELECT date(completed_at, 'localtime') AS d, COUNT(*) AS n
            FROM tasks WHERE completed_at IS NOT NULL GROUP BY d
          UNION ALL
          SELECT date(created_at, 'localtime') AS d, COUNT(*) AS n FROM notes GROUP BY d
          UNION ALL
          SELECT date AS d, COUNT(*) AS n FROM focus_sessions GROUP BY d
        ) GROUP BY d`
      return run(`SELECT d, n FROM (${sql}) ${range}`, [from, to])
  }
}

function run(sql: string, params: unknown[]): Record<string, number> {
  const rows = getDb()
    .prepare(sql)
    .all(...params) as { d: string; n: number }[]
  return Object.fromEntries(rows.filter((r) => r.d && r.n > 0).map((r) => [r.d, r.n]))
}

/**
 * History plus the summary figures under the grid.
 *
 * The current streak tolerates an empty today, so an unfinished morning does
 * not read as a broken run.
 */
export function activity(
  metric: ActivityMetric,
  opts: { days?: number; to?: string } = {}
): ActivityResult {
  const end = opts.to ?? today()
  const days = opts.days ?? 371
  const start = addDays(end, -(days - 1))
  const history = historyFor(metric, start, end)

  const dates = Object.keys(history).sort()
  const active = new Set(dates)

  let current = 0
  let cursor = active.has(end) ? end : addDays(end, -1)
  while (active.has(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }

  let longest = 0
  let run_ = 0
  for (let i = 0; i < dates.length; i++) {
    run_ = i > 0 && addDays(dates[i - 1], 1) === dates[i] ? run_ + 1 : 1
    if (run_ > longest) longest = run_
  }

  let bestDay: string | null = null
  let bestValue = 0
  let total = 0
  for (const [date, value] of Object.entries(history)) {
    total += value
    if (value > bestValue) {
      bestValue = value
      bestDay = date
    }
  }

  return {
    from: start,
    to: end,
    history,
    total,
    active_days: dates.length,
    current_streak: current,
    longest_streak: longest,
    best_day: bestDay,
    best_value: bestValue
  }
}
