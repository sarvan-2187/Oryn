import { getDb } from '../connection'
import type { NoteSummary } from '../../../shared/types'

/** Extracts and trims [[Reference]] tokens from text. */
export function parseLinks(text: string): string[] {
  const matches = [...text.matchAll(/\[\[([^[\]]+)\]\]/g)]
  return matches.map((m) => m[1].trim())
}

/**
 * Replaces the outgoing link set for one note with whatever [[references]]
 * are currently in its text, resolved by case-insensitive title match.
 * Delete-then-insert mirrors syncNoteTags in tags.ts — these sets are always
 * small, so diffing isn't worth the extra code. An unresolved title (typo,
 * or the target doesn't exist) is silently skipped; a note cannot link to
 * itself.
 */
export function syncNoteLinks(noteId: number, text: string): void {
  const db = getDb()
  const titles = parseLinks(text)
  const findByTitle = db.prepare(
    `SELECT id FROM notes WHERE lower(title) = lower(?) AND id != ? ORDER BY updated_at DESC LIMIT 1`
  )
  const targetIds = [
    ...new Set(
      titles
        .map((title) => (findByTitle.get(title, noteId) as { id: number } | undefined)?.id)
        .filter((id): id is number => id != null)
    )
  ]

  db.transaction(() => {
    db.prepare('DELETE FROM note_links WHERE source_id = ?').run(noteId)
    const insert = db.prepare('INSERT INTO note_links (source_id, target_id) VALUES (?, ?)')
    for (const targetId of targetIds) insert.run(noteId, targetId)
  })()
}

const BACKLINK_SUMMARY_COLS = `
  n.id, n.space_id, n.title, n.is_pinned, n.archived_at, n.created_at, n.updated_at,
  substr(n.content_text, 1, 140) AS excerpt
`

/** Notes that link to this one, i.e. its incoming [[references]]. */
export function listBacklinks(noteId: number): NoteSummary[] {
  return getDb()
    .prepare(
      `SELECT ${BACKLINK_SUMMARY_COLS} FROM note_links nl
       JOIN notes n ON n.id = nl.source_id
       WHERE nl.target_id = ?
       ORDER BY n.title`
    )
    .all(noteId) as NoteSummary[]
}
