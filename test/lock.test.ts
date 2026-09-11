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
const lock = await import('../src/main/db/queries/lock')

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

  check('isPinSet is false with no PIN ever set', () => {
    assert.equal(lock.isPinSet(), false)
  })

  check('setPin then verifyPin accepts the correct PIN and rejects a wrong one', () => {
    lock.setPin('1234')
    assert.equal(lock.isPinSet(), true)
    assert.equal(lock.verifyPin('1234'), true)
    assert.equal(lock.verifyPin('0000'), false)
  })

  check('changing the PIN invalidates the old one', () => {
    lock.setPin('1234')
    lock.setPin('5678')
    assert.equal(lock.verifyPin('1234'), false)
    assert.equal(lock.verifyPin('5678'), true)
  })

  check('clearPin removes the PIN entirely', () => {
    lock.setPin('1234')
    lock.clearPin()
    assert.equal(lock.isPinSet(), false)
    assert.equal(lock.verifyPin('1234'), false)
  })

  check('verifyPin is false when no PIN has ever been set', () => {
    lock.clearPin()
    assert.equal(lock.verifyPin('anything'), false)
  })

  check('getIdleMinutes defaults to 10 and setIdleMinutes overrides it', () => {
    assert.equal(lock.getIdleMinutes(), 10)
    lock.setIdleMinutes(15)
    assert.equal(lock.getIdleMinutes(), 15)
  })

  check('setIdleMinutes clamps below 1 up to 1', () => {
    lock.setIdleMinutes(0)
    assert.equal(lock.getIdleMinutes(), 1)
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
