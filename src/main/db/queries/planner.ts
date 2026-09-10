import { getDb } from '../connection'
import { today } from '../../../shared/dates'
import type { Deadline, ClassSlot, FocusSession, Capture } from '../../../shared/types'

export type { Deadline, ClassSlot, FocusSession, Capture }

/* ---------------------------------------------------------------- deadlines */

/** Nearest first. Past deadlines are dropped unless explicitly asked for. */
export function listDeadlines(
  opts: { spaceId?: number | null; includePast?: boolean } = {}
): Deadline[] {
  const where: string[] = []
  const params: unknown[] = []
  if (!opts.includePast) {
    where.push('date >= ?')
    params.push(today())
  }
  if (opts.spaceId != null) {
    where.push('space_id = ?')
    params.push(opts.spaceId)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  return getDb()
    .prepare(`SELECT * FROM deadlines ${clause} ORDER BY date, id`)
    .all(...params) as Deadline[]
}

export function createDeadline(input: {
  spaceId: number
  title: string
  date: string
  kind?: Deadline['kind']
}): Deadline {
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO deadlines (space_id, title, date, kind) VALUES (?, ?, ?, ?)')
    .run(input.spaceId, input.title, input.date, input.kind ?? 'exam')
  return db.prepare('SELECT * FROM deadlines WHERE id = ?').get(lastInsertRowid) as Deadline
}

export function updateDeadline(
  id: number,
  patch: Partial<Pick<Deadline, 'title' | 'date' | 'kind' | 'space_id'>>
): void {
  const keys = Object.keys(patch) as (keyof typeof patch)[]
  if (keys.length === 0) return
  getDb()
    .prepare(`UPDATE deadlines SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => patch[k]), id)
}

export function deleteDeadline(id: number): void {
  getDb().prepare('DELETE FROM deadlines WHERE id = ?').run(id)
}

/* ---------------------------------------------------------------- timetable */

/** Whole week, or one weekday (0 = Sunday) for the dashboard. */
export function listClasses(dayOfWeek?: number): ClassSlot[] {
  const db = getDb()
  if (dayOfWeek == null) {
    return db
      .prepare('SELECT * FROM timetable ORDER BY day_of_week, start_time')
      .all() as ClassSlot[]
  }
  return db
    .prepare('SELECT * FROM timetable WHERE day_of_week = ? ORDER BY start_time')
    .all(dayOfWeek) as ClassSlot[]
}

export function createClass(input: {
  subject: string
  dayOfWeek: number
  startTime: string
  endTime: string
  location?: string
  spaceId?: number | null
}): ClassSlot {
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO timetable (subject, day_of_week, start_time, end_time, location, space_id) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      input.subject,
      input.dayOfWeek,
      input.startTime,
      input.endTime,
      input.location ?? '',
      input.spaceId ?? null
    )
  return db.prepare('SELECT * FROM timetable WHERE id = ?').get(lastInsertRowid) as ClassSlot
}

export function deleteClass(id: number): void {
  getDb().prepare('DELETE FROM timetable WHERE id = ?').run(id)
}

/* ----------------------------------------------------------- focus sessions */

/** Records a finished pomodoro. Zero-length sessions are ignored. */
export function logFocus(minutes: number, taskId?: number | null, date?: string): void {
  if (minutes <= 0) return
  getDb()
    .prepare(
      "INSERT INTO focus_sessions (task_id, started_at, date, minutes) VALUES (?, datetime('now'), ?, ?)"
    )
    .run(taskId ?? null, date ?? today(), Math.round(minutes))
}

export function focusMinutes(date?: string): number {
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(minutes), 0) AS m FROM focus_sessions WHERE date = ?')
    .get(date ?? today()) as { m: number }
  return row.m
}

/* ----------------------------------------------------------------- captures */

/** Unprocessed captures, oldest first, so the inbox drains in order. */
export function listCaptures(): Capture[] {
  return getDb()
    .prepare('SELECT * FROM captures WHERE processed_at IS NULL ORDER BY created_at, id')
    .all() as Capture[]
}

export function createCapture(text: string): Capture | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const db = getDb()
  const { lastInsertRowid } = db.prepare('INSERT INTO captures (text) VALUES (?)').run(trimmed)
  return db.prepare('SELECT * FROM captures WHERE id = ?').get(lastInsertRowid) as Capture
}

export function captureCount(): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS c FROM captures WHERE processed_at IS NULL')
    .get() as { c: number }
  return row.c
}

export function deleteCapture(id: number): void {
  getDb().prepare('DELETE FROM captures WHERE id = ?').run(id)
}

/**
 * Turns a capture into a real note or task and marks it handled.
 * Kept in one transaction so a capture can never be consumed without the thing
 * it became actually existing.
 */
export function convertCapture(
  id: number,
  target: 'note' | 'task',
  spaceId: number
): { kind: 'note' | 'task'; id: number } | undefined {
  const db = getDb()
  return db.transaction(() => {
    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(id) as Capture | undefined
    if (!capture || capture.processed_at) return undefined

    let newId: number
    if (target === 'task') {
      const r = db
        .prepare('INSERT INTO tasks (space_id, title) VALUES (?, ?)')
        .run(spaceId, capture.text.slice(0, 200))
      newId = Number(r.lastInsertRowid)
    } else {
      // A capture is plain text, so it becomes a single paragraph block.
      const blocks = JSON.stringify([
        { type: 'paragraph', content: [{ type: 'text', text: capture.text, styles: {} }] }
      ])
      const r = db
        .prepare(
          'INSERT INTO notes (space_id, title, content_json, content_text) VALUES (?, ?, ?, ?)'
        )
        .run(spaceId, capture.text.split('\n')[0].slice(0, 120), blocks, capture.text)
      newId = Number(r.lastInsertRowid)
    }

    db.prepare("UPDATE captures SET processed_at = datetime('now') WHERE id = ?").run(id)
    return { kind: target, id: newId }
  })()
}
