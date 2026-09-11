/**
 * Global search: journal LIKE lookup, task/habit LIKE lookups, and the
 * combined globalSearch() fan-out.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-search-'))
process.env.ORYN_DB_PATH = join(dir, 'test.db')

const { getDb, closeDb } = await import('../src/main/db/connection')
const spaces = await import('../src/main/db/queries/spaces')
const journal = await import('../src/main/db/queries/journal')
const tasks = await import('../src/main/db/queries/tasks')
const habits = await import('../src/main/db/queries/habits')
const notes = await import('../src/main/db/queries/notes')
const search = await import('../src/main/db/queries/search')

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

try {
  getDb()
  spaces.listSpaces() // seeds the default spaces, same as other test files rely on

  check('searchJournal finds a matching entry by content, case-insensitively', () => {
    journal.saveJournal('2026-01-01', '[]', 'Went for a long Run this morning')
    journal.saveJournal('2026-01-02', '[]', 'Nothing notable')
    const rows = journal.searchJournal('%run%')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].date, '2026-01-01')
    assert.match(rows[0].excerpt, /Run/)
  })

  check('searchJournal does not match empty entries', () => {
    journal.saveJournal('2026-01-03', '[]', '')
    const rows = journal.searchJournal('%2026%')
    assert.ok(rows.every((r) => r.date !== '2026-01-03'))
  })

  const academic = spaces.listSpaces()[0].id
  const research = spaces.listSpaces()[1].id

  check('globalSearch finds matches across all four sources', () => {
    tasks.createTask({ spaceId: academic, title: 'Refactor the search index' })
    habits.createHabit({ spaceId: academic, name: 'Search for meaning daily' })
    notes.createNote({ spaceId: academic, title: 'Search notes' })
    journal.saveJournal('2026-02-01', '[]', 'Spent the day on search UX')

    const r = search.globalSearch('search', null)
    assert.equal(r.tasks.length, 1)
    assert.equal(r.tasks[0].title, 'Refactor the search index')
    assert.equal(r.habits.length, 1)
    assert.equal(r.habits[0].name, 'Search for meaning daily')
    assert.equal(r.notes.length, 1)
    assert.equal(r.journal.length, 1)
  })

  check('globalSearch scopes tasks and habits to a space, but not journal', () => {
    tasks.createTask({ spaceId: research, title: 'Search papers for citations' })
    const r = search.globalSearch('search', academic)
    assert.ok(r.tasks.every((t) => t.title !== 'Search papers for citations'))
    // Journal has no space_id column, so it's never scoped.
    assert.equal(r.journal.length, 1)
  })

  check('globalSearch returns empty groups for a blank query instead of everything', () => {
    const r = search.globalSearch('   ', null)
    assert.deepEqual(r, { notes: [], tasks: [], habits: [], journal: [] })
  })

  check("globalSearch escapes LIKE wildcards so '%' can't match everything", () => {
    const r = search.globalSearch('%', null)
    assert.equal(r.tasks.length, 0)
    assert.equal(r.habits.length, 0)
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
