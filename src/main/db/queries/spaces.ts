import { getDb } from '../connection'
import type { Space } from '../../../shared/types'

export type { Space }

export function listSpaces(): Space[] {
  return getDb().prepare('SELECT * FROM spaces ORDER BY sort_order, id').all() as Space[]
}

export function createSpace(input: { name: string; icon?: string; color?: string }): Space {
  const db = getDb()
  const max = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM spaces WHERE is_system = 0')
    .get() as { m: number }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO spaces (name, icon, color, sort_order) VALUES (?, ?, ?, ?)')
    .run(input.name, input.icon ?? 'circle', input.color ?? '#6366f1', max.m + 1)
  return db.prepare('SELECT * FROM spaces WHERE id = ?').get(lastInsertRowid) as Space
}

export function updateSpace(
  id: number,
  patch: Partial<Pick<Space, 'name' | 'icon' | 'color'>>
): void {
  const fields = Object.keys(patch) as (keyof typeof patch)[]
  if (fields.length === 0) return
  const set = fields.map((f) => `${f} = ?`).join(', ')
  getDb()
    .prepare(`UPDATE spaces SET ${set}, updated_at = datetime('now') WHERE id = ?`)
    .run(...fields.map((f) => patch[f]), id)
}

/** System spaces (Inbox) are not deletable. */
export function deleteSpace(id: number): void {
  getDb().prepare('DELETE FROM spaces WHERE id = ? AND is_system = 0').run(id)
}

export function inboxSpaceId(): number {
  const row = getDb()
    .prepare('SELECT id FROM spaces WHERE is_system = 1 ORDER BY id LIMIT 1')
    .get() as { id: number } | undefined
  return row?.id ?? 1
}
