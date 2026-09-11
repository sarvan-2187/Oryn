import { getDb } from '../connection'
import { syncNoteTags } from './tags'
import { syncNoteLinks } from './links'
import type { Note, NoteSummary, NotePatch } from '../../../shared/types'

export type { Note, NoteSummary }

const SUMMARY_COLS = `
  id, space_id, title, is_pinned, archived_at, created_at, updated_at,
  substr(content_text, 1, 140) AS excerpt
`

export function listNotes(
  opts: { spaceId?: number | null; archived?: boolean; tagId?: number | null } = {}
): NoteSummary[] {
  const where: string[] = [opts.archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL']
  const whereParams: unknown[] = []
  if (opts.spaceId != null) {
    where.push('space_id = ?')
    whereParams.push(opts.spaceId)
  }
  const join =
    opts.tagId != null ? 'JOIN note_tags nt ON nt.note_id = notes.id AND nt.tag_id = ?' : ''
  const joinParams = opts.tagId != null ? [opts.tagId] : []
  return getDb()
    .prepare(
      `SELECT ${SUMMARY_COLS} FROM notes ${join} WHERE ${where.join(' AND ')}
       ORDER BY is_pinned DESC, updated_at DESC`
    )
    .all(...joinParams, ...whereParams) as NoteSummary[]
}

export function getNote(id: number): Note | undefined {
  return getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note | undefined
}

export function createNote(input: { spaceId: number; title?: string }): Note {
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO notes (space_id, title) VALUES (?, ?)')
    .run(input.spaceId, input.title ?? '')
  if (input.title) {
    syncNoteTags(lastInsertRowid as number, input.title)
    syncNoteLinks(lastInsertRowid as number, input.title)
  }
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(lastInsertRowid) as Note
}

/**
 * Saves editor content. `contentText` is the flattened plain text the FTS index
 * is built from, so it must be passed whenever contentJson changes.
 */
export function updateNote(id: number, patch: NotePatch): void {
  const set: string[] = []
  const params: unknown[] = []
  if (patch.title !== undefined) {
    set.push('title = ?')
    params.push(patch.title)
  }
  if (patch.contentJson !== undefined) {
    set.push('content_json = ?')
    params.push(patch.contentJson)
  }
  if (patch.contentText !== undefined) {
    set.push('content_text = ?')
    params.push(patch.contentText)
  }
  if (patch.spaceId !== undefined) {
    set.push('space_id = ?')
    params.push(patch.spaceId)
  }
  if (patch.isPinned !== undefined) {
    set.push('is_pinned = ?')
    params.push(patch.isPinned ? 1 : 0)
  }
  if (set.length === 0) return
  params.push(id)
  getDb()
    .prepare(`UPDATE notes SET ${set.join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...params)

  if (patch.title !== undefined || patch.contentText !== undefined) {
    const row = getDb().prepare('SELECT title, content_text FROM notes WHERE id = ?').get(id) as {
      title: string
      content_text: string
    }
    syncNoteTags(id, `${row.title} ${row.content_text}`)
    syncNoteLinks(id, `${row.title} ${row.content_text}`)
  }
}

export function archiveNote(id: number, archived = true): void {
  getDb()
    .prepare(
      `UPDATE notes SET archived_at = ${archived ? "datetime('now')" : 'NULL'}, updated_at = datetime('now') WHERE id = ?`
    )
    .run(id)
}

/** Permanent. Only reachable from the archive view. */
export function deleteNote(id: number): void {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
}

/**
 * Escapes user input for FTS5 by quoting each term, so characters that are
 * MATCH operators (-, *, ", :, AND/OR/NOT) cannot break the query. A trailing
 * * on the last term gives prefix matching while typing.
 */
function toFtsQuery(raw: string): string | null {
  const terms = raw.match(/[\p{L}\p{N}_]+/gu)
  if (!terms || terms.length === 0) return null
  return terms.map((t, i) => (i === terms.length - 1 ? `"${t}"*` : `"${t}"`)).join(' ')
}

export function searchNotes(query: string, spaceId?: number | null): NoteSummary[] {
  const match = toFtsQuery(query)
  if (!match) return []
  const params: unknown[] = [match]
  let extra = ''
  if (spaceId != null) {
    extra = 'AND n.space_id = ?'
    params.push(spaceId)
  }
  return getDb()
    .prepare(
      `SELECT n.id, n.space_id, n.title, n.is_pinned, n.archived_at, n.created_at, n.updated_at,
              snippet(notes_fts, 1, '', '', '…', 12) AS excerpt
       FROM notes_fts f
       JOIN notes n ON n.id = f.rowid
       WHERE notes_fts MATCH ? AND n.archived_at IS NULL ${extra}
       ORDER BY rank
       LIMIT 50`
    )
    .all(...params) as NoteSummary[]
}
