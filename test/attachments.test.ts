/** Attachment storage: DB rows plus real files on disk. */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-attachments-'))
process.env.ORYN_DB_PATH = join(dir, 'test.db')
const attachmentsRoot = join(dir, 'attachments')
process.env.ORYN_ATTACHMENTS_DIR = attachmentsRoot

const { getDb, closeDb } = await import('../src/main/db/connection')
const spaces = await import('../src/main/db/queries/spaces')
const attachments = await import('../src/main/db/queries/attachments')

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

try {
  getDb()
  spaces.listSpaces() // seeds the default spaces, same as other test files rely on

  check('listAttachments is empty for an owner with none', () => {
    assert.deepEqual(attachments.listAttachments('task', 1), [])
  })

  check('createAttachment writes the file and records the row', () => {
    const base64 = Buffer.from('hello world').toString('base64')
    const a = attachments.createAttachment({
      kind: 'audio',
      ownerType: 'note',
      ownerId: 1,
      filename: 'clip.webm',
      dataBase64: base64
    })
    assert.equal(a.kind, 'audio')
    assert.equal(a.filename, 'clip.webm')

    const list = attachments.listAttachments('note', 1)
    assert.equal(list.length, 1)
    assert.equal(list[0].id, a.id)

    const path = attachments.attachmentPath(a.id)
    assert.ok(path)
    assert.equal(readFileSync(path!, 'utf8'), 'hello world')

    assert.equal(attachments.readAttachmentBase64(a.id), base64)
  })

  check('addFileAttachment copies an existing file in and records it', () => {
    const source = join(dir, 'report.pdf')
    writeFileSync(source, 'fake pdf bytes')
    const a = attachments.addFileAttachment('task', 2, source)
    assert.equal(a.kind, 'file')
    assert.equal(a.filename, 'report.pdf')
    const path = attachments.attachmentPath(a.id)
    assert.equal(readFileSync(path!, 'utf8'), 'fake pdf bytes')
  })

  check('deleteAttachment removes both the row and the file', () => {
    const a = attachments.createAttachment({
      kind: 'file',
      ownerType: 'task',
      ownerId: 3,
      filename: 'doomed.txt',
      dataBase64: Buffer.from('x').toString('base64')
    })
    const path = attachments.attachmentPath(a.id)!
    attachments.deleteAttachment(a.id)
    assert.deepEqual(attachments.listAttachments('task', 3), [])
    assert.equal(attachments.attachmentPath(a.id), null)
    assert.throws(() => readFileSync(path))
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
