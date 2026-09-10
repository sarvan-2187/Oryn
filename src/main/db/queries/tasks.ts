import { getDb } from '../connection'
import { nextOccurrence, today } from '../../../shared/dates'
import type { Task, TaskTree, TaskPatch } from '../../../shared/types'

export type { Task, TaskTree }

export type Scope = 'today' | 'upcoming' | 'all' | 'someday'

/**
 * Top-level tasks for a scope, each with its subtasks attached.
 *
 * `today` deliberately keeps tasks completed today in the list, so ticking one
 * off gives feedback instead of making it vanish mid-click.
 */
export function listTasks(opts: { spaceId?: number | null; scope?: Scope; date?: string } = {}): TaskTree[] {
  const db = getDb()
  const day = opts.date ?? today()
  const where: string[] = ['parent_id IS NULL']
  const params: unknown[] = []

  if (opts.spaceId != null) {
    where.push('space_id = ?')
    params.push(opts.spaceId)
  }

  switch (opts.scope ?? 'all') {
    case 'today':
      where.push(
        "((status != 'done' AND due_date IS NOT NULL AND due_date <= ?) OR (status = 'done' AND date(completed_at, 'localtime') = ?))"
      )
      params.push(day, day)
      break
    case 'upcoming':
      where.push("status != 'done' AND due_date > ?")
      params.push(day)
      break
    case 'someday':
      where.push("status != 'done' AND due_date IS NULL")
      break
  }

  const parents = db
    .prepare(
      `SELECT * FROM tasks WHERE ${where.join(' AND ')}
       ORDER BY
         status = 'done',
         due_date IS NULL,
         due_date,
         CASE priority WHEN 'high' THEN 0 WHEN 'med' THEN 1 ELSE 2 END,
         sort_order, id`
    )
    .all(...params) as Task[]

  if (parents.length === 0) return []

  const placeholders = parents.map(() => '?').join(',')
  const kids = db
    .prepare(`SELECT * FROM tasks WHERE parent_id IN (${placeholders}) ORDER BY sort_order, id`)
    .all(...parents.map((p) => p.id)) as Task[]

  return parents.map((p) => ({ ...p, children: kids.filter((k) => k.parent_id === p.id) }))
}

export function createTask(input: {
  spaceId: number
  title: string
  dueDate?: string | null
  priority?: Task['priority']
  parentId?: number | null
  recurRule?: Task['recur_rule']
}): Task {
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO tasks (space_id, parent_id, title, due_date, priority, recur_rule)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.spaceId,
      input.parentId ?? null,
      input.title,
      input.dueDate ?? null,
      input.priority ?? 'med',
      input.recurRule ?? null
    )
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(lastInsertRowid) as Task
}

const PATCH_COLUMNS: Record<keyof TaskPatch, string> = {
  title: 'title',
  description: 'description',
  dueDate: 'due_date',
  priority: 'priority',
  status: 'status',
  recurRule: 'recur_rule',
  spaceId: 'space_id',
  sortOrder: 'sort_order'
}

export function updateTask(id: number, patch: TaskPatch): void {
  const set: string[] = []
  const params: unknown[] = []
  for (const [key, column] of Object.entries(PATCH_COLUMNS) as [keyof TaskPatch, string][]) {
    if (patch[key] !== undefined) {
      set.push(`${column} = ?`)
      params.push(patch[key])
    }
  }
  if (set.length === 0) return
  params.push(id)
  getDb().prepare(`UPDATE tasks SET ${set.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params)
}

/**
 * Flips a task between done and todo.
 *
 * Completing a recurring task spawns its next instance rather than rescheduling
 * this one, so the heatmap keeps a record of every completion. The spawn and the
 * completion share a transaction so a crash cannot leave a recurring task with
 * no future occurrence.
 */
export function toggleTask(id: number, date?: string): Task | undefined {
  const db = getDb()
  const day = date ?? today()

  return db.transaction(() => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
    if (!task) return undefined

    if (task.status === 'done') {
      db.prepare(
        "UPDATE tasks SET status = 'todo', completed_at = NULL, updated_at = datetime('now') WHERE id = ?"
      ).run(id)
      return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task
    }

    db.prepare(
      "UPDATE tasks SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(id)
    // Subtasks of a completed task are completed too.
    db.prepare(
      "UPDATE tasks SET status = 'done', completed_at = datetime('now') WHERE parent_id = ? AND status != 'done'"
    ).run(id)

    if (task.recur_rule) {
      const base = task.due_date ?? day
      db.prepare(
        `INSERT INTO tasks (space_id, parent_id, title, description, due_date, priority, recur_rule, sort_order)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`
      ).run(
        task.space_id,
        task.title,
        task.description,
        nextOccurrence(base, task.recur_rule),
        task.priority,
        task.recur_rule,
        task.sort_order
      )
    }

    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task
  })()
}

export function deleteTask(id: number): void {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

/** Counts for the dashboard header. */
export function taskCounts(date?: string, spaceId?: number | null): { due: number; overdue: number; done: number } {
  const day = date ?? today()
  const scope = spaceId != null ? 'AND space_id = ?' : ''
  const args = spaceId != null ? [spaceId] : []
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE status != 'done' AND due_date = ?)                  AS due,
         COUNT(*) FILTER (WHERE status != 'done' AND due_date < ?)                  AS overdue,
         COUNT(*) FILTER (WHERE status = 'done' AND date(completed_at, 'localtime') = ?)         AS done
       FROM tasks WHERE parent_id IS NULL ${scope}`
    )
    .get(day, day, day, ...args) as { due: number; overdue: number; done: number }
  return row
}
