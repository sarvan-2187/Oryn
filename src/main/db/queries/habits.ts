import { getDb } from '../connection'
import { addDays, today } from '../../../shared/dates'
import type { Habit, HabitToday, HabitStats } from '../../../shared/types'

export type { Habit, HabitToday, HabitStats }

export function listHabits(spaceId?: number | null): Habit[] {
  const where = spaceId != null ? 'WHERE is_active = 1 AND space_id = ?' : 'WHERE is_active = 1'
  return getDb()
    .prepare(`SELECT * FROM habits ${where} ORDER BY sort_order, id`)
    .all(...(spaceId != null ? [spaceId] : [])) as Habit[]
}

/** Habits joined with one day's entry, for the check-in row. */
export function habitsForDate(date?: string, spaceId?: number | null): HabitToday[] {
  const day = date ?? today()
  const scope = spaceId != null ? 'AND h.space_id = ?' : ''
  const rows = getDb()
    .prepare(
      `SELECT h.*, COALESCE(e.value, 0) AS value
       FROM habits h
       LEFT JOIN habit_entries e ON e.habit_id = h.id AND e.date = ?
       WHERE h.is_active = 1 ${scope}
       ORDER BY h.sort_order, h.id`
    )
    .all(day, ...(spaceId != null ? [spaceId] : [])) as (Habit & { value: number })[]
  return rows.map((r) => ({ ...r, done: r.value >= r.target }))
}

export function createHabit(input: {
  spaceId: number
  name: string
  kind?: Habit['kind']
  target?: number
  unit?: string
  color?: string
}): Habit {
  const db = getDb()
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM habits').get() as {
    m: number
  }
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO habits (space_id, name, kind, target, unit, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      input.spaceId,
      input.name,
      input.kind ?? 'bool',
      input.target ?? 1,
      input.unit ?? '',
      input.color ?? '#30a46c',
      max.m + 1
    )
  return db.prepare('SELECT * FROM habits WHERE id = ?').get(lastInsertRowid) as Habit
}

export function updateHabit(
  id: number,
  patch: Partial<
    Pick<Habit, 'name' | 'kind' | 'target' | 'unit' | 'color' | 'is_active' | 'space_id'>
  >
): void {
  const keys = Object.keys(patch) as (keyof typeof patch)[]
  if (keys.length === 0) return
  getDb()
    .prepare(
      `UPDATE habits SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`
    )
    .run(...keys.map((k) => patch[k]), id)
}

export function deleteHabit(id: number): void {
  getDb().prepare('DELETE FROM habits WHERE id = ?').run(id)
}

/**
 * Records a value for one day. Zero removes the row entirely, so "unchecked"
 * and "never recorded" stay the same state and the heatmap has no zero-valued
 * squares to special-case.
 */
export function setHabitValue(habitId: number, date: string, value: number): void {
  const db = getDb()
  if (value <= 0) {
    db.prepare('DELETE FROM habit_entries WHERE habit_id = ? AND date = ?').run(habitId, date)
    return
  }
  db.prepare(
    `INSERT INTO habit_entries (habit_id, date, value) VALUES (?, ?, ?)
     ON CONFLICT(habit_id, date) DO UPDATE SET value = excluded.value`
  ).run(habitId, date, value)
}

/** Check-off toggle: sets the value to the habit's target, or clears it. */
export function toggleHabit(habitId: number, date: string): void {
  const db = getDb()
  const habit = db.prepare('SELECT target FROM habits WHERE id = ?').get(habitId) as
    { target: number } | undefined
  if (!habit) return
  const existing = db
    .prepare('SELECT value FROM habit_entries WHERE habit_id = ? AND date = ?')
    .get(habitId, date) as { value: number } | undefined
  setHabitValue(habitId, date, existing && existing.value >= habit.target ? 0 : habit.target)
}

/** Dates on which a habit met its target, newest first. */
function completedDates(habitId: number): string[] {
  return (
    getDb()
      .prepare(
        `SELECT e.date FROM habit_entries e
         JOIN habits h ON h.id = e.habit_id
         WHERE e.habit_id = ? AND e.value >= h.target
         ORDER BY e.date DESC`
      )
      .all(habitId) as { date: string }[]
  ).map((r) => r.date)
}

/**
 * Streaks over completed days.
 *
 * The current streak tolerates today being unchecked: a run ending yesterday
 * still counts, so an unfinished morning does not read as a broken streak.
 */
export function habitStats(habitId: number, date?: string): HabitStats {
  const day = date ?? today()
  const dates = completedDates(habitId)
  if (dates.length === 0) return { current_streak: 0, longest_streak: 0, days_done: 0 }

  const set = new Set(dates)
  let current = 0
  let cursor = set.has(day) ? day : addDays(day, -1)
  while (set.has(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }

  let longest = 1
  let run = 1
  for (let i = 1; i < dates.length; i++) {
    if (addDays(dates[i], 1) === dates[i - 1]) run++
    else run = 1
    if (run > longest) longest = run
  }

  return { current_streak: current, longest_streak: longest, days_done: dates.length }
}

/** Values keyed by date for one habit, used by the 30-day strip and the heatmap. */
export function habitHistory(habitId: number, from: string, to: string): Record<string, number> {
  const rows = getDb()
    .prepare('SELECT date, value FROM habit_entries WHERE habit_id = ? AND date BETWEEN ? AND ?')
    .all(habitId, from, to) as { date: string; value: number }[]
  return Object.fromEntries(rows.map((r) => [r.date, r.value]))
}
