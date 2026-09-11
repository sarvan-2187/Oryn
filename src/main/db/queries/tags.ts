import { getDb } from '../connection'
import type { Tag } from '../../../shared/types'

export type { Tag }

export function listTags(): Tag[] {
  return getDb().prepare('SELECT * FROM tags ORDER BY name').all() as Tag[]
}

/** Extracts #tag tokens from text, lowercased and deduped. */
export function parseTags(text: string): string[] {
  const matches = text.match(/#([\p{L}\p{N}_-]+)/gu) ?? []
  const names = matches.map((m) => m.slice(1).toLowerCase())
  return [...new Set(names)]
}

function upsertTagIds(names: string[]): number[] {
  if (names.length === 0) return []
  const db = getDb()
  const insert = db.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING')
  const select = db.prepare('SELECT id FROM tags WHERE name = ?')
  return names.map((name) => {
    insert.run(name)
    return (select.get(name) as { id: number }).id
  })
}

/**
 * Replaces the tag set for one note with whatever #tags are currently in its
 * text. Delete-then-insert is simplest and correct — these sets are always
 * small, so diffing isn't worth the extra code.
 */
export function syncNoteTags(noteId: number, text: string): void {
  const db = getDb()
  const ids = upsertTagIds(parseTags(text))
  db.transaction(() => {
    db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId)
    const insert = db.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)')
    for (const id of ids) insert.run(noteId, id)
  })()
}

export function syncTaskTags(taskId: number, text: string): void {
  const db = getDb()
  const ids = upsertTagIds(parseTags(text))
  db.transaction(() => {
    db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId)
    const insert = db.prepare('INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)')
    for (const id of ids) insert.run(taskId, id)
  })()
}
