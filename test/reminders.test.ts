/** Settings get/set, and the pure reminder-summary decision logic. */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-reminders-'))
process.env.ORYN_DB_PATH = join(dir, 'test.db')

const { getDb, closeDb } = await import('../src/main/db/connection')
const spaces = await import('../src/main/db/queries/spaces')
const settings = await import('../src/main/db/queries/settings')
const tasks = await import('../src/main/db/queries/tasks')
const habits = await import('../src/main/db/queries/habits')
const reminders = await import('../src/main/db/queries/reminders')
const { addDays, today } = await import('../src/shared/dates')

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

try {
  getDb()
  spaces.listSpaces() // seeds the default spaces, same as other test files rely on

  check('getSetting returns undefined for a key that was never set', () => {
    assert.equal(settings.getSetting('nope'), undefined)
  })

  check('setSetting then getSetting round-trips the value', () => {
    settings.setSetting('reminders.lastNotifiedDate', '2026-01-01')
    assert.equal(settings.getSetting('reminders.lastNotifiedDate'), '2026-01-01')
  })

  check('setSetting overwrites rather than erroring on an existing key', () => {
    settings.setSetting('reminders.lastNotifiedDate', '2026-01-01')
    settings.setSetting('reminders.lastNotifiedDate', '2026-01-02')
    assert.equal(settings.getSetting('reminders.lastNotifiedDate'), '2026-01-02')
  })

  const academic = spaces.listSpaces()[0].id
  const day = today()

  check('an empty day has no due tasks and no at-risk habits', () => {
    const summary = reminders.buildReminderSummary(day)
    assert.equal(summary.dueTaskCount, 0)
    assert.deepEqual(summary.atRiskHabits, [])
  })

  check('an undone task due today counts toward dueTaskCount', () => {
    tasks.createTask({ spaceId: academic, title: 'Ship it', dueDate: day })
    const summary = reminders.buildReminderSummary(day)
    assert.equal(summary.dueTaskCount, 1)
  })

  check('a done task due today does not count', () => {
    const before = reminders.buildReminderSummary(day).dueTaskCount
    const t = tasks.createTask({ spaceId: academic, title: 'Already done', dueDate: day })
    tasks.toggleTask(t.id, day) // mark it done immediately, before the next check
    const after = reminders.buildReminderSummary(day).dueTaskCount
    assert.equal(after, before)
  })

  check('a habit streak below the threshold is not at-risk', () => {
    const habit = habits.createHabit({ spaceId: academic, name: 'Short streak' })
    habits.toggleHabit(habit.id, addDays(day, -1)) // 1-day streak, not done today
    const summary = reminders.buildReminderSummary(day)
    assert.ok(!summary.atRiskHabits.some((h) => h.id === habit.id))
  })

  check('a habit streak at or above the threshold, not done today, is at-risk', () => {
    const habit = habits.createHabit({ spaceId: academic, name: 'Long streak' })
    habits.toggleHabit(habit.id, addDays(day, -1))
    habits.toggleHabit(habit.id, addDays(day, -2))
    habits.toggleHabit(habit.id, addDays(day, -3)) // 3-day streak ending yesterday
    const summary = reminders.buildReminderSummary(day)
    const found = summary.atRiskHabits.find((h) => h.id === habit.id)
    assert.ok(found)
    assert.equal(found!.streak, 3)
  })

  check('a habit already done today is never at-risk, regardless of streak', () => {
    const habit = habits.createHabit({ spaceId: academic, name: 'Done already' })
    habits.toggleHabit(habit.id, addDays(day, -1))
    habits.toggleHabit(habit.id, addDays(day, -2))
    habits.toggleHabit(habit.id, day) // done today
    const summary = reminders.buildReminderSummary(day)
    assert.ok(!summary.atRiskHabits.some((h) => h.id === habit.id))
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
