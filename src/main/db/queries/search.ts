import { getDb } from '../connection'
import { searchNotes } from './notes'
import { searchJournal } from './journal'
import type {
  TaskSearchResult,
  HabitSearchResult,
  GlobalSearchResult
} from '../../../shared/types'

const LIMIT = 5

/**
 * Wraps a raw query as a LIKE pattern, escaping the characters LIKE treats
 * specially so user input like "50% off" or "a_b" can't behave as a wildcard.
 * Paired with `ESCAPE '\'` in every query that uses this.
 */
function likeTerm(raw: string): string {
  return `%${raw.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
}

function searchTasks(term: string, spaceId?: number | null): TaskSearchResult[] {
  const where = [
    'parent_id IS NULL',
    "(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')"
  ]
  const params: unknown[] = [term, term]
  if (spaceId != null) {
    where.push('space_id = ?')
    params.push(spaceId)
  }
  return getDb()
    .prepare(
      `SELECT id, title, status, due_date FROM tasks WHERE ${where.join(' AND ')}
       ORDER BY updated_at DESC LIMIT ${LIMIT}`
    )
    .all(...params) as TaskSearchResult[]
}

function searchHabits(term: string, spaceId?: number | null): HabitSearchResult[] {
  const where = ['is_active = 1', "name LIKE ? ESCAPE '\\'"]
  const params: unknown[] = [term]
  if (spaceId != null) {
    where.push('space_id = ?')
    params.push(spaceId)
  }
  return getDb()
    .prepare(
      `SELECT id, name FROM habits WHERE ${where.join(' AND ')} ORDER BY sort_order LIMIT ${LIMIT}`
    )
    .all(...params) as HabitSearchResult[]
}

/**
 * Fans out one query across notes (FTS5), tasks, habits and journal (all
 * plain LIKE — these tables stay small for a personal app, so an FTS index
 * isn't worth the upkeep). Tasks/habits respect the active space filter;
 * journal never does, since journal entries have no space_id.
 */
export function globalSearch(query: string, spaceId?: number | null): GlobalSearchResult {
  const q = query.trim()
  if (!q) return { notes: [], tasks: [], habits: [], journal: [] }
  const term = likeTerm(q)
  return {
    notes: searchNotes(q, spaceId).slice(0, LIMIT),
    tasks: searchTasks(term, spaceId),
    habits: searchHabits(term, spaceId),
    journal: searchJournal(term)
  }
}
