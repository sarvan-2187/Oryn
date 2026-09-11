import { getDb } from '../connection'
import { daysBetween } from '../../../shared/dates'
import type { ReviewSummary } from '../../../shared/types'

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
