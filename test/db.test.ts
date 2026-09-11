/**
 * One runnable check over the data layer: migrations, FTS indexing and the
 * query-escaping that keeps user punctuation from becoming FTS5 operators.
 * Run with `npm test`.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-test-'))
process.env.ORYN_DB_PATH = join(dir, 'test.db')

const { getDb, closeDb } = await import('../src/main/db/connection')
const spaces = await import('../src/main/db/queries/spaces')
const notes = await import('../src/main/db/queries/notes')

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

try {
  check('migrations run and seed the five spaces', () => {
    const all = spaces.listSpaces()
    assert.equal(all.length, 5)
    assert.deepEqual(
      all.map((s) => s.name),
      ['Academic', 'Research', 'Hackathons', 'Personal', 'Inbox']
    )
    assert.equal(getDb().pragma('user_version', { simple: true }), 4)
  })

  check('inbox is the system space and is not deletable', () => {
    const inbox = spaces.inboxSpaceId()
    spaces.deleteSpace(inbox)
    assert.equal(spaces.listSpaces().length, 5)
  })

  const academic = spaces.listSpaces()[0].id
  const note = notes.createNote({ spaceId: academic, title: 'Thermodynamics' })

  check('a new note is listed in its space', () => {
    const list = notes.listNotes({ spaceId: academic })
    assert.equal(list.length, 1)
    assert.equal(list[0].title, 'Thermodynamics')
  })

  check('full-text search finds a word from the body', () => {
    notes.updateNote(note.id, {
      contentJson: '[]',
      contentText: 'entropy always increases in an isolated system'
    })
    const hits = notes.searchNotes('entropy')
    assert.equal(hits.length, 1)
    assert.equal(hits[0].id, note.id)
  })

  check('search matches a prefix while typing', () => {
    assert.equal(notes.searchNotes('entro').length, 1)
  })

  check('editing a note re-indexes it', () => {
    notes.updateNote(note.id, { contentText: 'enthalpy is a state function' })
    assert.equal(notes.searchNotes('entropy').length, 0)
    assert.equal(notes.searchNotes('enthalpy').length, 1)
  })

  check('punctuation is escaped, not treated as FTS operators', () => {
    // Each of these is a syntax error if passed to MATCH unescaped.
    for (const q of ['C++ "quoted"', '-dash', 'NOT', 'a OR b', 'x:y', '***', '((']) {
      assert.doesNotThrow(() => notes.searchNotes(q), `query ${q} threw`)
    }
    assert.deepEqual(notes.searchNotes('   '), [])
  })

  check('search is scoped to a space when asked', () => {
    const research = spaces.listSpaces()[1].id
    const other = notes.createNote({ spaceId: research })
    notes.updateNote(other.id, { contentText: 'enthalpy in a different space' })
    assert.equal(notes.searchNotes('enthalpy').length, 2)
    assert.equal(notes.searchNotes('enthalpy', academic).length, 1)
    notes.deleteNote(other.id)
  })

  check('archiving hides a note from the list and from search', () => {
    notes.archiveNote(note.id)
    assert.equal(notes.listNotes({ spaceId: academic }).length, 0)
    assert.equal(notes.listNotes({ spaceId: academic, archived: true }).length, 1)
    assert.equal(notes.searchNotes('enthalpy').length, 0)
    notes.archiveNote(note.id, false)
    assert.equal(notes.searchNotes('enthalpy').length, 1)
  })

  check('deleting a note leaves no orphan in the FTS index', () => {
    notes.deleteNote(note.id)
    assert.equal(notes.searchNotes('enthalpy').length, 0)
    const rows = getDb().prepare('SELECT count(*) AS c FROM notes_fts').get() as { c: number }
    assert.equal(rows.c, 0)
  })

  check('deleting a space cascades to its notes', () => {
    const tmp = spaces.createSpace({ name: 'Temp' })
    notes.createNote({ spaceId: tmp.id, title: 'doomed' })
    spaces.deleteSpace(tmp.id)
    assert.equal(notes.listNotes({ spaceId: tmp.id }).length, 0)
  })

  check('reopening an existing database does not re-run migrations', () => {
    closeDb()
    const db = getDb()
    assert.equal(db.pragma('user_version', { simple: true }), 4)
    assert.equal(spaces.listSpaces().length, 5)
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
