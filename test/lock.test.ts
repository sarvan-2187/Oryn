/** PIN hashing/verification and idle-minutes settings. */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-lock-'))
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

  check('deleteSetting removes a key that was set', () => {
    settings.setSetting('temp.key', 'value')
    settings.deleteSetting('temp.key')
    assert.equal(settings.getSetting('temp.key'), undefined)
  })

  check('deleteSetting on a key that was never set does not throw', () => {
    settings.deleteSetting('never.set')
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
