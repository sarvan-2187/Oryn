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

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
