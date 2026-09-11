import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  copyFileSync
} from 'node:fs'
import { join, extname, basename } from 'node:path'
import { getDb } from '../connection'
import type { Attachment } from '../../../shared/types'

/**
 * Where attachment files live on disk. ORYN_ATTACHMENTS_DIR wins, which lets
 * this module run outside Electron (tests, scripts) — same override pattern
 * dbPath() in connection.ts already uses. Electron is required lazily for
 * the same reason.
 */
export function attachmentsDir(): string {
  const override = process.env.ORYN_ATTACHMENTS_DIR
  if (override) return override
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')
  return join(app.getPath('userData'), 'attachments')
}

function rowPath(id: number, filename: string): string {
  return join(attachmentsDir(), `${id}${extname(filename)}`)
}

export function listAttachments(ownerType: 'note' | 'task', ownerId: number): Attachment[] {
  return getDb()
    .prepare(
      'SELECT * FROM attachments WHERE owner_type = ? AND owner_id = ? ORDER BY created_at'
    )
    .all(ownerType, ownerId) as Attachment[]
}

/** Saves base64-encoded bytes to disk and records the attachment row. */
export function createAttachment(input: {
  kind: 'file' | 'audio'
  ownerType: 'note' | 'task'
  ownerId: number
  filename: string
  dataBase64: string
}): Attachment {
  const db = getDb()
  mkdirSync(attachmentsDir(), { recursive: true })
  const { lastInsertRowid } = db
    .prepare('INSERT INTO attachments (kind, owner_type, owner_id, filename) VALUES (?, ?, ?, ?)')
    .run(input.kind, input.ownerType, input.ownerId, input.filename)
  const id = lastInsertRowid as number
  writeFileSync(rowPath(id, input.filename), Buffer.from(input.dataBase64, 'base64'))
  return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Attachment
}

/** Copies an existing file (e.g. from a native file picker) into the store. */
export function addFileAttachment(
  ownerType: 'note' | 'task',
  ownerId: number,
  sourcePath: string
): Attachment {
  const db = getDb()
  mkdirSync(attachmentsDir(), { recursive: true })
  const filename = basename(sourcePath)
  const { lastInsertRowid } = db
    .prepare('INSERT INTO attachments (kind, owner_type, owner_id, filename) VALUES (?, ?, ?, ?)')
    .run('file', ownerType, ownerId, filename)
  const id = lastInsertRowid as number
  copyFileSync(sourcePath, rowPath(id, filename))
  return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Attachment
}

export function attachmentPath(id: number): string | null {
  const row = getDb().prepare('SELECT filename FROM attachments WHERE id = ?').get(id) as
    | { filename: string }
    | undefined
  if (!row) return null
  return rowPath(id, row.filename)
}

export function readAttachmentBase64(id: number): string | null {
  const path = attachmentPath(id)
  if (!path || !existsSync(path)) return null
  return readFileSync(path).toString('base64')
}

export function deleteAttachment(id: number): void {
  const path = attachmentPath(id)
  getDb().prepare('DELETE FROM attachments WHERE id = ?').run(id)
  if (path && existsSync(path)) unlinkSync(path)
}
