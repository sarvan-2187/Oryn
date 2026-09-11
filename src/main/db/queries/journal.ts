import { getDb } from '../connection'
import { today } from '../../../shared/dates'
import type { JournalEntry, JournalSearchResult } from '../../../shared/types'

export type { JournalEntry }

/** Returns the entry for a date, creating an empty one on first open. */
export function getJournal(date?: string): JournalEntry {
  const db = getDb()
  const day = date ?? today()
  const existing = db.prepare('SELECT * FROM journal WHERE date = ?').get(day) as
    JournalEntry | undefined
  if (existing) return existing
  db.prepare('INSERT INTO journal (date) VALUES (?)').run(day)
  return db.prepare('SELECT * FROM journal WHERE date = ?').get(day) as JournalEntry
}

export function saveJournal(date: string, contentJson: string, contentText: string): void {
  getDb()
    .prepare(
      `INSERT INTO journal (date, content_json, content_text) VALUES (?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         content_json = excluded.content_json,
         content_text = excluded.content_text,
         updated_at   = datetime('now')`
    )
    .run(date, contentJson, contentText)
}

/**
 * Read-only content search. Separate from getJournal, which creates an empty
 * row for any date that doesn't exist yet — wrong behaviour while searching.
 * `term` is a caller-supplied LIKE pattern (already wrapped in `%...%` and
 * escaped), so this function stays a thin, parameterized query.
 */
export function searchJournal(term: string): JournalSearchResult[] {
  return getDb()
    .prepare(
      `SELECT date, substr(content_text, 1, 140) AS excerpt FROM journal
       WHERE content_text LIKE ? ESCAPE '\\' AND content_text != ''
       ORDER BY date DESC LIMIT 5`
    )
    .all(term) as JournalSearchResult[]
}
