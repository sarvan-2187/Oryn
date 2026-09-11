/** [[link]] parsing, resolution, sync, and the backlinks listing. */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-links-'))
process.env.ORYN_DB_PATH = join(dir, 'test.db')

const { getDb, closeDb } = await import('../src/main/db/connection')
const spaces = await import('../src/main/db/queries/spaces')
const notes = await import('../src/main/db/queries/notes')
const links = await import('../src/main/db/queries/links')

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

try {
  getDb()
  const academic = spaces.listSpaces()[0].id

  check('parseLinks extracts and trims [[...]] references', () => {
    assert.deepEqual(
      links.parseLinks('See [[Grocery List]] and also [[ Trip Planning ]].'),
      ['Grocery List', 'Trip Planning']
    )
  })

  check('parseLinks returns an empty array when there are none', () => {
    assert.deepEqual(links.parseLinks('Just a plain sentence.'), [])
  })

  check('syncNoteLinks resolves a matching title, case-insensitively', () => {
    const target = notes.createNote({ spaceId: academic, title: 'Grocery List' })
    const source = notes.createNote({ spaceId: academic, title: 'Weekend plan' })
    links.syncNoteLinks(source.id, 'See [[grocery list]] for what to buy.')
    const backlinks = links.listBacklinks(target.id)
    assert.deepEqual(
      backlinks.map((n) => n.id),
      [source.id]
    )
  })

  check('syncNoteLinks skips an unresolved title without error', () => {
    const source = notes.createNote({ spaceId: academic, title: 'Orphan link' })
    links.syncNoteLinks(source.id, 'See [[Nothing Named This]].')
    // No throw, and no backlink row was created anywhere to check against —
    // this just confirms syncNoteLinks doesn't throw on a miss.
  })

  check('a note cannot link to itself', () => {
    const note = notes.createNote({ spaceId: academic, title: 'Self Referencer' })
    links.syncNoteLinks(note.id, 'See [[Self Referencer]] again.')
    assert.equal(links.listBacklinks(note.id).length, 0)
  })

  check('syncNoteLinks replaces the link set rather than accumulating it', () => {
    const a = notes.createNote({ spaceId: academic, title: 'Target A' })
    const b = notes.createNote({ spaceId: academic, title: 'Target B' })
    const source = notes.createNote({ spaceId: academic, title: 'Switcher' })
    links.syncNoteLinks(source.id, 'First [[Target A]]')
    assert.equal(links.listBacklinks(a.id).length, 1)
    links.syncNoteLinks(source.id, 'Now [[Target B]] instead')
    assert.equal(links.listBacklinks(a.id).length, 0)
    assert.equal(links.listBacklinks(b.id).length, 1)
  })

  check('creating a note with a [[link]] in the title links it immediately', () => {
    const target = notes.createNote({ spaceId: academic, title: 'Immediate Target' })
    const source = notes.createNote({ spaceId: academic, title: 'See [[Immediate Target]]' })
    const backlinks = links.listBacklinks(target.id)
    assert.deepEqual(
      backlinks.map((n) => n.id),
      [source.id]
    )
  })

  check('editing a note body to add a [[link]] creates the backlink', () => {
    const target = notes.createNote({ spaceId: academic, title: 'Body Target' })
    const source = notes.createNote({ spaceId: academic, title: 'Editable' })
    assert.equal(links.listBacklinks(target.id).length, 0)
    notes.updateNote(source.id, { contentText: 'Mentions [[Body Target]] in the body.' })
    assert.equal(links.listBacklinks(target.id).length, 1)
  })

  check('editing a note to remove a [[link]] drops the backlink', () => {
    const target = notes.createNote({ spaceId: academic, title: 'Removable Target' })
    const source = notes.createNote({ spaceId: academic, title: 'Has link' })
    notes.updateNote(source.id, { contentText: 'See [[Removable Target]]' })
    assert.equal(links.listBacklinks(target.id).length, 1)
    notes.updateNote(source.id, { contentText: 'No link anymore' })
    assert.equal(links.listBacklinks(target.id).length, 0)
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
