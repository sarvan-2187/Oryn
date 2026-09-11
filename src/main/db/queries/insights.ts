import { getDb } from '../connection'
import { addDays, daysBetween } from '../../../shared/dates'
import type { ReviewSummary, HabitCorrelation } from '../../../shared/types'

function count(sql: string, params: unknown[]): number {
  const row = getDb().prepare(sql).get(...params) as { n: number }
  return row.n
}

function busiestSpace(from: string, to: string): { id: number; name: string } | null {
  const row = getDb()
    .prepare(
      `SELECT s.id, s.name, SUM(x.n) AS total FROM (
         SELECT h.space_id AS space_id, COUNT(*) AS n
           FROM habit_entries e JOIN habits h ON h.id = e.habit_id
           WHERE e.date BETWEEN ? AND ? GROUP BY h.space_id
         UNION ALL
         SELECT space_id, COUNT(*) AS n FROM tasks
           WHERE completed_at IS NOT NULL AND date(completed_at, 'localtime') BETWEEN ? AND ?
           GROUP BY space_id
         UNION ALL
         SELECT space_id, COUNT(*) AS n FROM notes
           WHERE date(created_at, 'localtime') BETWEEN ? AND ? GROUP BY space_id
       ) x JOIN spaces s ON s.id = x.space_id
       WHERE s.is_system = 0
       GROUP BY s.id ORDER BY total DESC LIMIT 1`
    )
    .get(from, to, from, to, from, to) as { id: number; name: string } | undefined
  return row ?? null
}

/**
 * The Review screen's four headline numbers plus the busiest space, for one
 * date range. Everything here is derived from existing rows — no new table,
 * same philosophy activity() in stats.ts already uses for the heatmap.
 */
export function reviewSummary(from: string, to: string, spaceId?: number | null): ReviewSummary {
  const scope = spaceId != null ? 'AND space_id = ?' : ''
  const scopeArgs = spaceId != null ? [spaceId] : []

  const tasksCreated = count(
    `SELECT COUNT(*) AS n FROM tasks WHERE date(created_at, 'localtime') BETWEEN ? AND ? ${scope}`,
    [from, to, ...scopeArgs]
  )
  const tasksCompleted = count(
    `SELECT COUNT(*) AS n FROM tasks
     WHERE completed_at IS NOT NULL AND date(completed_at, 'localtime') BETWEEN ? AND ? ${scope}`,
    [from, to, ...scopeArgs]
  )

  const habitScope = spaceId != null ? 'AND h.space_id = ?' : ''
  const habitCount = count(
    `SELECT COUNT(*) AS n FROM habits h WHERE h.is_active = 1 ${habitScope}`,
    scopeArgs
  )
  const doneCount = count(
    `SELECT COUNT(*) AS n FROM habit_entries e JOIN habits h ON h.id = e.habit_id
     WHERE h.is_active = 1 ${habitScope} AND e.date BETWEEN ? AND ? AND e.value >= h.target`,
    [...scopeArgs, from, to]
  )
  const days = daysBetween(from, to) + 1
  const habitCompletionPct =
    habitCount > 0 && days > 0 ? Math.round((doneCount / (habitCount * days)) * 1000) / 10 : 0

  // Journal has no space_id column, so it's never scoped — same limitation
  // global search already documents for journal.
  const journalEntries = count(
    `SELECT COUNT(*) AS n FROM journal WHERE date BETWEEN ? AND ? AND content_text != ''`,
    [from, to]
  )

  return {
    from,
    to,
    tasksCreated,
    tasksCompleted,
    habitCompletionPct,
    journalEntries,
    busiestSpace: spaceId != null ? null : busiestSpace(from, to)
  }
}

/** Pearson correlation of two 0/1 sequences. Null when either has no variance. */
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n === 0) return null
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  if (denX === 0 || denY === 0) return null
  return num / Math.sqrt(denX * denY)
}

const CORRELATION_THRESHOLD = 0.3
const MAX_CORRELATIONS = 5

/**
 * Same-day co-occurrence between pairs of active habits, as a Pearson
 * correlation of their daily done/not-done sequences. Computed in plain TS
 * rather than SQL — pairwise comparison across N habits doesn't map cleanly
 * onto one query, and the data volume here is tiny. Noise-filtered: weak
 * pairs (|r| < 0.3) are dropped, and only the strongest 5 are returned —
 * this is the most speculative of the Insights items, so it stays a short,
 * skimmable list.
 */
export function habitCorrelations(
  from: string,
  to: string,
  spaceId?: number | null
): HabitCorrelation[] {
  const db = getDb()
  const scope = spaceId != null ? 'AND space_id = ?' : ''
  const scopeArgs = spaceId != null ? [spaceId] : []
  const habitRows = db
    .prepare(`SELECT id, name, target FROM habits WHERE is_active = 1 ${scope}`)
    .all(...scopeArgs) as { id: number; name: string; target: number }[]
  if (habitRows.length < 2) return []

  const entries = db
    .prepare('SELECT habit_id, date, value FROM habit_entries WHERE date BETWEEN ? AND ?')
    .all(from, to) as { habit_id: number; date: string; value: number }[]

  const targetById = new Map(habitRows.map((h) => [h.id, h.target]))
  const doneDatesById = new Map<number, Set<string>>()
  for (const e of entries) {
    const target = targetById.get(e.habit_id)
    if (target == null || e.value < target) continue
    if (!doneDatesById.has(e.habit_id)) doneDatesById.set(e.habit_id, new Set())
    doneDatesById.get(e.habit_id)!.add(e.date)
  }

  const dates: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d)

  const results: HabitCorrelation[] = []
  for (let i = 0; i < habitRows.length; i++) {
    for (let j = i + 1; j < habitRows.length; j++) {
      const a = habitRows[i]
      const b = habitRows[j]
      const doneA = doneDatesById.get(a.id) ?? new Set()
      const doneB = doneDatesById.get(b.id) ?? new Set()
      const r = pearson(
        dates.map((d) => (doneA.has(d) ? 1 : 0)),
        dates.map((d) => (doneB.has(d) ? 1 : 0))
      )
      if (r != null && Math.abs(r) >= CORRELATION_THRESHOLD) {
        results.push({
          habitA: { id: a.id, name: a.name },
          habitB: { id: b.id, name: b.name },
          correlation: r
        })
      }
    }
  }

  return results
    .sort((x, y) => Math.abs(y.correlation) - Math.abs(x.correlation))
    .slice(0, MAX_CORRELATIONS)
}
