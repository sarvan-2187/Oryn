/**
 * Checks for the parts of Phase 2 that are easy to get subtly wrong:
 * recurrence arithmetic, streak counting, and the today/upcoming scopes.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-logic-'))
process.env.ORYN_DB_PATH = join(dir, 'test.db')

const { closeDb } = await import('../src/main/db/connection')
const spaces = await import('../src/main/db/queries/spaces')
const tasks = await import('../src/main/db/queries/tasks')
const habits = await import('../src/main/db/queries/habits')
const journal = await import('../src/main/db/queries/journal')
const { nextOccurrence, addDays, daysBetween } = await import('../src/shared/dates')

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

try {
  const space = spaces.listSpaces()[0].id
  const DAY = '2026-03-10' // a Tuesday

  check('daily and weekly recurrence advance by the right span', () => {
    assert.equal(nextOccurrence(DAY, 'daily'), '2026-03-11')
    assert.equal(nextOccurrence(DAY, 'weekly'), '2026-03-17')
  })

  check('weekdays recurrence skips the weekend', () => {
    assert.equal(nextOccurrence('2026-03-13', 'weekdays'), '2026-03-16') // Fri -> Mon
    assert.equal(nextOccurrence('2026-03-12', 'weekdays'), '2026-03-13') // Thu -> Fri
  })

  check('monthly recurrence clamps to the last valid day', () => {
    assert.equal(nextOccurrence('2026-01-31', 'monthly'), '2026-02-28')
    assert.equal(nextOccurrence('2028-01-31', 'monthly'), '2028-02-29') // leap year
    assert.equal(nextOccurrence('2026-03-31', 'monthly'), '2026-04-30')
    assert.equal(nextOccurrence('2026-03-15', 'monthly'), '2026-04-15')
  })

  check('date arithmetic crosses month and year boundaries', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01')
    assert.equal(addDays('2026-03-01', -1), '2026-02-28')
    assert.equal(daysBetween('2026-03-01', '2026-03-11'), 10)
    assert.equal(daysBetween('2026-03-11', '2026-03-01'), -10)
  })

  check('today scope holds overdue and due-today, not future work', () => {
    tasks.createTask({ spaceId: space, title: 'overdue', dueDate: addDays(DAY, -3) })
    tasks.createTask({ spaceId: space, title: 'due today', dueDate: DAY })
    tasks.createTask({ spaceId: space, title: 'later', dueDate: addDays(DAY, 5) })
    tasks.createTask({ spaceId: space, title: 'no date' })

    assert.deepEqual(
      tasks.listTasks({ scope: 'today', date: DAY }).map((t) => t.title),
      ['overdue', 'due today']
    )
    assert.deepEqual(
      tasks.listTasks({ scope: 'upcoming', date: DAY }).map((t) => t.title),
      ['later']
    )
    assert.deepEqual(
      tasks.listTasks({ scope: 'someday', date: DAY }).map((t) => t.title),
      ['no date']
    )
  })

  check('completing a recurring task creates exactly one next instance', () => {
    const t = tasks.createTask({
      spaceId: space,
      title: 'standup',
      dueDate: DAY,
      recurRule: 'weekdays'
    })
    tasks.toggleTask(t.id, DAY)

    const open = tasks
      .listTasks({ scope: 'all' })
      .filter((x) => x.title === 'standup' && x.status !== 'done')
    assert.equal(open.length, 1)
    assert.equal(open[0].due_date, '2026-03-11')
    assert.notEqual(open[0].id, t.id)
  })

  check('re-completing a task spawns exactly one more instance', () => {
    const before = tasks.listTasks({ scope: 'all' }).filter((x) => x.title === 'standup').length
    const done = tasks
      .listTasks({ scope: 'all' })
      .find((x) => x.title === 'standup' && x.status === 'done')!
    tasks.toggleTask(done.id, DAY) // un-complete: must not spawn
    tasks.toggleTask(done.id, DAY) // complete again: spawns one
    const after = tasks.listTasks({ scope: 'all' }).filter((x) => x.title === 'standup').length
    assert.equal(after, before + 1)
  })

  check('completing a parent completes its subtasks', () => {
    const parent = tasks.createTask({ spaceId: space, title: 'assignment', dueDate: DAY })
    tasks.createTask({ spaceId: space, title: 'part a', parentId: parent.id })
    tasks.createTask({ spaceId: space, title: 'part b', parentId: parent.id })

    const before = tasks.listTasks({ scope: 'today', date: DAY }).find((t) => t.id === parent.id)!
    assert.equal(before.children.length, 2)

    tasks.toggleTask(parent.id, DAY)
    const after = tasks.listTasks({ scope: 'all' }).find((t) => t.id === parent.id)!
    assert.ok(after.children.every((c) => c.status === 'done'))
  })

  check('deleting a parent task removes its subtasks', () => {
    const parent = tasks.createTask({ spaceId: space, title: 'throwaway' })
    tasks.createTask({ spaceId: space, title: 'child', parentId: parent.id })
    tasks.deleteTask(parent.id)
    assert.equal(tasks.listTasks({ scope: 'all' }).filter((t) => t.title === 'throwaway').length, 0)
  })

  const gym = habits.createHabit({ spaceId: space, name: 'Gym' })
  const leet = habits.createHabit({
    spaceId: space,
    name: 'LeetCode',
    kind: 'count',
    target: 2,
    unit: 'problems'
  })

  check('a check-off habit toggles on and off', () => {
    habits.toggleHabit(gym.id, DAY)
    assert.equal(habits.habitsForDate(DAY).find((h) => h.id === gym.id)!.done, true)
    habits.toggleHabit(gym.id, DAY)
    assert.equal(habits.habitsForDate(DAY).find((h) => h.id === gym.id)!.done, false)
  })

  check('a countable habit is done only once it reaches its target', () => {
    habits.setHabitValue(leet.id, DAY, 1)
    assert.equal(habits.habitsForDate(DAY).find((h) => h.id === leet.id)!.done, false)
    habits.setHabitValue(leet.id, DAY, 2)
    assert.equal(habits.habitsForDate(DAY).find((h) => h.id === leet.id)!.done, true)
  })

  check('a zero value clears the entry rather than storing a zero', () => {
    habits.setHabitValue(leet.id, DAY, 0)
    assert.deepEqual(habits.habitHistory(leet.id, DAY, DAY), {})
  })

  check('streaks count consecutive completed days', () => {
    for (let i = 0; i < 5; i++) habits.toggleHabit(gym.id, addDays(DAY, -i))
    const s = habits.habitStats(gym.id, DAY)
    assert.equal(s.current_streak, 5)
    assert.equal(s.days_done, 5)
  })

  check('a gap breaks the current streak but the longest run is remembered', () => {
    // Leaves a hole three days back, so the current run is only the last three days.
    habits.setHabitValue(gym.id, addDays(DAY, -3), 0)
    const s = habits.habitStats(gym.id, DAY)
    assert.equal(s.current_streak, 3)
    assert.equal(s.longest_streak, 3)
    assert.equal(s.days_done, 4)
  })

  check('an unchecked today does not break a run ending yesterday', () => {
    const s = habits.habitStats(gym.id, addDays(DAY, 1))
    assert.equal(s.current_streak, 3)
  })

  check('a habit with no entries has no streak', () => {
    const fresh = habits.createHabit({ spaceId: space, name: 'Untouched' })
    assert.deepEqual(habits.habitStats(fresh.id, DAY), {
      current_streak: 0,
      longest_streak: 0,
      days_done: 0
    })
  })

  check('deleting a habit removes its entries', () => {
    const temp = habits.createHabit({ spaceId: space, name: 'Temp' })
    habits.toggleHabit(temp.id, DAY)
    habits.deleteHabit(temp.id)
    assert.deepEqual(habits.habitHistory(temp.id, DAY, DAY), {})
  })

  check('the journal keeps one entry per date and overwrites in place', () => {
    const first = journal.getJournal(DAY)
    assert.equal(first.date, DAY)
    journal.saveJournal(DAY, '[]', 'lab report draft')
    journal.saveJournal(DAY, '[]', 'lab report final')
    assert.equal(journal.getJournal(DAY).content_text, 'lab report final')
    assert.equal(journal.getJournal(DAY).id, first.id)
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
