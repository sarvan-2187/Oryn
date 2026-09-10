/**
 * Phase 3 logic: heatmap aggregation across sources, capture conversion, and
 * the planner queries.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-p3-'))
process.env.ORYN_DB_PATH = join(dir, 'test.db')

const { getDb, closeDb } = await import('../src/main/db/connection')
const spaces = await import('../src/main/db/queries/spaces')
const tasks = await import('../src/main/db/queries/tasks')
const habits = await import('../src/main/db/queries/habits')
const notes = await import('../src/main/db/queries/notes')
const planner = await import('../src/main/db/queries/planner')
const stats = await import('../src/main/db/queries/stats')
const { addDays, today } = await import('../src/shared/dates')

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

try {
  const db = getDb()
  const academic = spaces.listSpaces()[0].id
  const research = spaces.listSpaces()[1].id
  const day = today()

  check('an empty database yields an empty heatmap, not a crash', () => {
    const a = stats.activity({ kind: 'all' })
    assert.equal(a.total, 0)
    assert.equal(a.active_days, 0)
    assert.equal(a.current_streak, 0)
    assert.equal(a.best_day, null)
  })

  const gym = habits.createHabit({ spaceId: academic, name: 'Gym' })

  check('habit checks appear on the right squares', () => {
    habits.toggleHabit(gym.id, day)
    habits.toggleHabit(gym.id, addDays(day, -1))
    const a = stats.activity({ kind: 'habit', habitId: gym.id })
    assert.equal(a.history[day], 1)
    assert.equal(a.history[addDays(day, -1)], 1)
    assert.equal(a.current_streak, 2)
    assert.equal(a.active_days, 2)
  })

  check('the everything metric sums across sources', () => {
    const t = tasks.createTask({ spaceId: academic, title: 'done thing', dueDate: day })
    tasks.toggleTask(t.id, day)
    notes.createNote({ spaceId: academic, title: 'a note' })
    planner.logFocus(25, null, day)

    // Two habit checks, one completed task, one note, one focus session.
    const a = stats.activity({ kind: 'all' })
    assert.equal(a.history[day], 4, 'habit + task + note + focus on the same day')
    assert.equal(a.total, 5)
  })

  check('each metric counts only its own source', () => {
    assert.equal(stats.activity({ kind: 'tasks' }).history[day], 1)
    assert.equal(stats.activity({ kind: 'notes' }).history[day], 1)
    // Focus is measured in minutes, not sessions.
    assert.equal(stats.activity({ kind: 'focus' }).history[day], 25)
  })

  check('space activity ignores other spaces', () => {
    notes.createNote({ spaceId: research, title: 'research note' })
    assert.equal(stats.activity({ kind: 'space', spaceId: research }).history[day], 1)
    assert.equal(stats.activity({ kind: 'space', spaceId: academic }).history[day], 3)
  })

  check('days outside the window are excluded', () => {
    const old = addDays(day, -400)
    db.prepare('INSERT INTO habit_entries (habit_id, date, value) VALUES (?, ?, 1)').run(
      gym.id,
      old
    )
    const a = stats.activity({ kind: 'habit', habitId: gym.id })
    assert.equal(a.history[old], undefined)
    const wide = stats.activity({ kind: 'habit', habitId: gym.id }, { days: 500 })
    assert.equal(wide.history[old], 1)
  })

  check('focus logging rejects a zero-length session', () => {
    const before = planner.focusMinutes(day)
    planner.logFocus(0, null, day)
    planner.logFocus(-5, null, day)
    assert.equal(planner.focusMinutes(day), before)
  })

  check('a blank capture is not stored', () => {
    assert.equal(planner.createCapture('   '), undefined)
    assert.equal(planner.captureCount(), 0)
  })

  check('a capture becomes a task and leaves the inbox', () => {
    const c = planner.createCapture('email the professor about the lab')!
    assert.equal(planner.captureCount(), 1)
    const made = planner.convertCapture(c.id, 'task', academic)
    assert.equal(made?.kind, 'task')
    assert.equal(planner.captureCount(), 0)
    const created = tasks.listTasks({ scope: 'all' }).find((t) => t.id === made!.id)
    assert.equal(created?.title, 'email the professor about the lab')
  })

  check('a capture becomes a searchable note', () => {
    const c = planner.createCapture('rewrite the abstract before Friday')!
    const made = planner.convertCapture(c.id, 'note', research)
    assert.equal(made?.kind, 'note')
    // Conversion must populate content_text, or the note is invisible to search.
    assert.equal(notes.searchNotes('abstract').length, 1)
  })

  check('a capture cannot be converted twice', () => {
    const c = planner.createCapture('only once')!
    assert.ok(planner.convertCapture(c.id, 'task', academic))
    assert.equal(planner.convertCapture(c.id, 'note', academic), undefined)
  })

  check('deadlines list nearest first and hide past dates', () => {
    planner.createDeadline({ spaceId: academic, title: 'Finals', date: addDays(day, 20) })
    planner.createDeadline({ spaceId: academic, title: 'Report', date: addDays(day, 3) })
    planner.createDeadline({ spaceId: academic, title: 'Old exam', date: addDays(day, -5) })

    assert.deepEqual(
      planner.listDeadlines().map((d) => d.title),
      ['Report', 'Finals']
    )
    assert.equal(planner.listDeadlines({ includePast: true }).length, 3)
  })

  check('the timetable filters by weekday', () => {
    planner.createClass({ subject: 'DBMS', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' })
    planner.createClass({ subject: 'OS Lab', dayOfWeek: 1, startTime: '14:00', endTime: '16:00' })
    planner.createClass({ subject: 'Maths', dayOfWeek: 3, startTime: '11:00', endTime: '12:00' })

    assert.deepEqual(
      planner.listClasses(1).map((c) => c.subject),
      ['DBMS', 'OS Lab']
    )
    assert.equal(planner.listClasses().length, 3)
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
