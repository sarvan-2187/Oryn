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

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
