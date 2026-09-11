/** Checklist templates, missed-task carry-over, and the due-date suggestion. */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-automation-'))
process.env.ORYN_DB_PATH = join(dir, 'test.db')

const { getDb, closeDb } = await import('../src/main/db/connection')
const spaces = await import('../src/main/db/queries/spaces')
const templates = await import('../src/main/db/queries/templates')
const tasks = await import('../src/main/db/queries/tasks')
const { addDays, today } = await import('../src/shared/dates')

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

try {
  getDb()
  const academic = spaces.listSpaces()[0].id

  check('createTemplate then listTemplates round-trips items as an array', () => {
    templates.createTemplate('Morning routine', ['Stretch', 'Journal', 'Plan the day'])
    const all = templates.listTemplates()
    assert.equal(all.length, 1)
    assert.equal(all[0].title, 'Morning routine')
    assert.deepEqual(all[0].items, ['Stretch', 'Journal', 'Plan the day'])
  })

  check('deleteTemplate removes it', () => {
    const t = templates.createTemplate('Disposable', ['One item'])
    templates.deleteTemplate(t.id)
    assert.ok(!templates.listTemplates().some((x) => x.id === t.id))
  })

  check('spawnTemplate creates one task per item, due on the given date', () => {
    const t = templates.createTemplate('Weekly review', ['Inbox zero', 'Plan next week'])
    const created = templates.spawnTemplate(t.id, academic, '2026-03-01')
    assert.equal(created.length, 2)
    assert.deepEqual(
      created.map((task) => task.title),
      ['Inbox zero', 'Plan next week']
    )
    assert.ok(created.every((task) => task.due_date === '2026-03-01'))
    assert.ok(created.every((task) => task.space_id === academic))
  })

  const day = today()

  check('carryOverMissedTasks bumps an overdue, undone, non-recurring task to today', () => {
    const t = tasks.createTask({
      spaceId: academic,
      title: 'Overdue thing',
      dueDate: addDays(day, -5)
    })
    const moved = tasks.carryOverMissedTasks(day)
    assert.ok(moved >= 1)
    const reloaded = tasks.listTasks({ spaceId: academic, scope: 'all' }).find((x) => x.id === t.id)
    assert.equal(reloaded!.due_date, day)
  })

  check('carryOverMissedTasks leaves a recurring task alone', () => {
    const t = tasks.createTask({
      spaceId: academic,
      title: 'Recurring overdue',
      dueDate: addDays(day, -5),
      recurRule: 'daily'
    })
    tasks.carryOverMissedTasks(day)
    const reloaded = tasks.listTasks({ spaceId: academic, scope: 'all' }).find((x) => x.id === t.id)
    assert.equal(reloaded!.due_date, addDays(day, -5))
  })

  check('carryOverMissedTasks leaves a done task alone', () => {
    const t = tasks.createTask({
      spaceId: academic,
      title: 'Finished late',
      dueDate: addDays(day, -5)
    })
    tasks.toggleTask(t.id, day)
    tasks.carryOverMissedTasks(day)
    const reloaded = tasks.listTasks({ spaceId: academic, scope: 'all' }).find((x) => x.id === t.id)
    assert.equal(reloaded!.due_date, addDays(day, -5))
  })

  check('suggestDueDate returns null with no history for that title', () => {
    assert.equal(tasks.suggestDueDate(academic, 'Something never seen before'), null)
  })

  check('suggestDueDate returns null for a blank title', () => {
    assert.equal(tasks.suggestDueDate(academic, '   '), null)
  })

  check('suggestDueDate suggests a date based on past completion gaps for a similar title', () => {
    // Three past "Pay rent" tasks, each completed 2 days after creation.
    for (let i = 0; i < 3; i++) {
      const created = addDays(day, -30 + i)
      const t = tasks.createTask({ spaceId: academic, title: 'Pay rent', dueDate: created })
      getDb()
        .prepare('UPDATE tasks SET created_at = ? WHERE id = ?')
        .run(`${created} 00:00:00`, t.id)
      tasks.toggleTask(t.id, addDays(created, 2))
      getDb()
        .prepare('UPDATE tasks SET completed_at = ? WHERE id = ?')
        .run(`${addDays(created, 2)} 00:00:00`, t.id)
    }
    const suggested = tasks.suggestDueDate(academic, 'Pay rent')
    assert.equal(suggested, addDays(day, 2))
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
