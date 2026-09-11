/** Tag parsing and the note/task tag-sync + listing functions. */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-tags-'))
process.env.ORYN_DB_PATH = join(dir, 'test.db')

const { getDb, closeDb } = await import('../src/main/db/connection')
const spaces = await import('../src/main/db/queries/spaces')
const notes = await import('../src/main/db/queries/notes')
const tags = await import('../src/main/db/queries/tags')

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

try {
  getDb()
  const academic = spaces.listSpaces()[0].id

  check('parseTags extracts, lowercases and dedupes #tokens', () => {
    assert.deepEqual(
      tags.parseTags('Buy milk #Shopping and eggs #shopping #URGENT'),
      ['shopping', 'urgent']
    )
  })

  check('parseTags returns an empty array when there are none', () => {
    assert.deepEqual(tags.parseTags('Just a plain sentence.'), [])
  })

  check('syncNoteTags creates tags on first use and lists them', () => {
    const note = notes.createNote({ spaceId: academic, title: 'Groceries #shopping' })
    tags.syncNoteTags(note.id, 'Groceries #shopping')
    const all = tags.listTags()
    assert.deepEqual(
      all.map((t) => t.name),
      ['shopping']
    )
  })

  check('syncNoteTags replaces the tag set rather than accumulating it', () => {
    const note = notes.createNote({ spaceId: academic, title: 'Groceries #shopping' })
    tags.syncNoteTags(note.id, 'Groceries #shopping')
    tags.syncNoteTags(note.id, 'Groceries #cooking') // no more #shopping
    const noteTagRows = getDb()
      .prepare(
        `SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = ?`
      )
      .all(note.id) as { name: string }[]
    assert.deepEqual(
      noteTagRows.map((r) => r.name),
      ['cooking']
    )
  })

  check('two notes sharing a tag reuse the same tag row', () => {
    const a = notes.createNote({ spaceId: academic, title: 'A #shared' })
    const b = notes.createNote({ spaceId: academic, title: 'B #shared' })
    tags.syncNoteTags(a.id, 'A #shared')
    tags.syncNoteTags(b.id, 'B #shared')
    const shared = tags.listTags().find((t) => t.name === 'shared')
    assert.ok(shared)
    const count = getDb()
      .prepare('SELECT COUNT(*) AS n FROM note_tags WHERE tag_id = ?')
      .get(shared!.id) as { n: number }
    assert.equal(count.n, 2)
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
