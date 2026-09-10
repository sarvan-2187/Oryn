import { getDb } from '../connection'
import { today } from '../../../shared/dates'
import type { JournalEntry } from '../../../shared/types'

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
