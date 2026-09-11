import { getDb } from '../connection'
import { createTask } from './tasks'
import { today } from '../../../shared/dates'
import type { Template, Task } from '../../../shared/types'

export type { Template }

function toTemplate(row: {
  id: number
  title: string
  items_json: string
  created_at: string
}): Template {
  let items: string[] = []
  try {
    const parsed = JSON.parse(row.items_json)
    if (Array.isArray(parsed)) items = parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    items = []
  }
  return { id: row.id, title: row.title, items, created_at: row.created_at }
}

export function listTemplates(): Template[] {
  const rows = getDb()
    .prepare('SELECT * FROM templates ORDER BY created_at DESC')
    .all() as { id: number; title: string; items_json: string; created_at: string }[]
  return rows.map(toTemplate)
}

export function createTemplate(title: string, items: string[]): Template {
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO templates (title, items_json) VALUES (?, ?)')
    .run(title, JSON.stringify(items))
  return toTemplate(
    db.prepare('SELECT * FROM templates WHERE id = ?').get(lastInsertRowid) as {
      id: number
      title: string
      items_json: string
      created_at: string
    }
  )
}

export function deleteTemplate(id: number): void {
  getDb().prepare('DELETE FROM templates WHERE id = ?').run(id)
}

/** Spawns one top-level task per template item, all due on the given date. */
export function spawnTemplate(id: number, spaceId: number, date?: string): Task[] {
  const db = getDb()
  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as
    | { id: number; title: string; items_json: string; created_at: string }
    | undefined
  if (!row) return []
  const template = toTemplate(row)
  const dueDate = date ?? today()
  return template.items.map((title) => createTask({ spaceId, title, dueDate }))
}
