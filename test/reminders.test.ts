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

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
