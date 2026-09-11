/** Review summary (tasks/habits/journal/busiest-space) and habit correlations. */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-insights-'))
process.env.ORYN_DB_PATH = join(dir, 'test.db')

const { getDb, closeDb } = await import('../src/main/db/connection')
const spaces = await import('../src/main/db/queries/spaces')
const tasks = await import('../src/main/db/queries/tasks')
const habits = await import('../src/main/db/queries/habits')
const journal = await import('../src/main/db/queries/journal')
const insights = await import('../src/main/db/queries/insights')
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
  const research = spaces.listSpaces()[1].id
  const day = today()
  const from = addDays(day, -6)

  check('an empty range has all-zero counts and no busiest space', () => {
    const s = insights.reviewSummary(from, day, null)
    assert.equal(s.tasksCreated, 0)
    assert.equal(s.tasksCompleted, 0)
    assert.equal(s.habitCompletionPct, 0)
    assert.equal(s.journalEntries, 0)
    assert.equal(s.busiestSpace, null)
  })

  check('counts tasks created and completed within range', () => {
    const t1 = tasks.createTask({ spaceId: academic, title: 'A', dueDate: day })
    tasks.createTask({ spaceId: academic, title: 'B', dueDate: day })
    tasks.toggleTask(t1.id, day)
    const s = insights.reviewSummary(from, day, null)
    assert.equal(s.tasksCreated, 2)
    assert.equal(s.tasksCompleted, 1)
  })

  check('habitCompletionPct reflects done entries against active-habit-days', () => {
    const h = habits.createHabit({ spaceId: academic, name: 'Gym' })
    habits.toggleHabit(h.id, day) // one done day out of a 7-day, 1-habit window
    const s = insights.reviewSummary(from, day, null)
    // 1 done / (1 habit * 7 days) = ~14.3%
    assert.ok(s.habitCompletionPct > 10 && s.habitCompletionPct < 20)
  })

  check('counts non-empty journal entries within range', () => {
    journal.saveJournal(day, '[]', 'Something happened today')
    journal.saveJournal(addDays(day, -10), '[]', 'Outside the range')
    const s = insights.reviewSummary(from, day, null)
    assert.equal(s.journalEntries, 1)
  })

  check('busiestSpace picks the space with the most combined activity, excluding the system space', () => {
    // Academic already has 2 units of activity from earlier checks (one
    // completed task, one habit check), so research needs to clearly exceed
    // that rather than just add one more completed task.
    const a = tasks.createTask({ spaceId: research, title: 'Busy space task 1', dueDate: day })
    const b = tasks.createTask({ spaceId: research, title: 'Busy space task 2', dueDate: day })
    const c = tasks.createTask({ spaceId: research, title: 'Busy space task 3', dueDate: day })
    tasks.toggleTask(a.id, day)
    tasks.toggleTask(b.id, day)
    tasks.toggleTask(c.id, day)
    const s = insights.reviewSummary(from, day, null)
    assert.equal(s.busiestSpace?.id, research)
  })

  check('busiestSpace is null once a specific space is already selected', () => {
    const s = insights.reviewSummary(from, day, academic)
    assert.equal(s.busiestSpace, null)
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
