# Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three attachment types: images pasted/dropped into a note, files attached to a task, and short voice recordings attached to a note.

**Architecture:** Files on tasks and voice notes on notes go through one `attachments` table (`kind`, `owner_type`, `owner_id`, `filename`) plus real files under `userData/attachments/`, mirroring the `dbPath()` override pattern `connection.ts` already uses so the query layer stays Electron-free and unit-testable. Images work differently and don't touch this table at all — see the Global Constraints deviation below.

**Tech Stack:** better-sqlite3, Node's built-in `fs`/`crypto`, Electron's `dialog`/`shell` (main process only), the browser's native `MediaRecorder` API (renderer, no dependency). No new npm dependencies.

## Global Constraints

- No new npm dependencies.
- Never edit migrations 001-004 — this is a real, already-migrated local database. `attachments` is migration 005.
- Follow the existing IPC pattern: entries in `src/main/ipc.ts`'s `handlers` map, mirrored in `src/preload/index.ts`'s `api`, typed in `src/preload/index.d.ts`'s `OrynApi`.
- Backend query functions use parameterized (`?`) placeholders only, never string-concatenated user input.
- Tests run via `npm test`; add the new test file to the `test` script in `package.json` (both the esbuild bundle list and the `node` run list).
- Code that imports from `'electron'` (`dialog`, `shell`) cannot be exercised by the `npm test` node-script suite — same split `capture.ts`/`backup.ts`/`reminders.ts` already use: pure logic in `src/main/db/queries/`, thin untested glue in `src/main/`.
- **Deviation from the original one-line design note in `FUTURE_WORK.md`:** it described a custom `oryn-file://` protocol registered in the main process so `<img>` tags could load attachment files, with images going through the same `attachments` table as everything else. That's real Electron protocol-registration work (`protocol.registerSchemesAsPrivileged` before `app.ready`, a handler, security review of what paths it can serve) for a problem BlockNote already solves for free: its `uploadFile` option just needs to return a URL string, and a `data:` URL — the pasted/dropped image's own bytes, base64-encoded, no file on disk, no protocol, no IPC round-trip — is a perfectly valid one. Images use that instead. `ponytail:` this means no size limit or compression on pasted images, so a very large image bloats that note's `content_json`; add a size cap or downscaling only if that turns out to actually matter in practice.
- `attachments.kind` is `'file' | 'audio'` only — not `'image'`, per the deviation above.

---

### Task 1: `attachments` table (migration 005) and shared type

**Files:**
- Modify: `src/main/db/migrations.ts`
- Modify: `src/shared/types.ts`

**Interfaces:**
- Produces: table `attachments(id, kind, owner_type, owner_id, filename, created_at)`, shared type `Attachment { id: number; kind: 'file' | 'audio'; owner_type: 'note' | 'task'; owner_id: number; filename: string; created_at: string }` — consumed by Task 2.

- [ ] **Step 1: Append the migration**

In `src/main/db/migrations.ts`, add a fifth array entry after the templates migration (insert a comma and a new entry before the closing `]`):

```ts
  ,
  // 005 - attachments
  `
  CREATE TABLE attachments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT    NOT NULL CHECK (kind IN ('file', 'audio')),
    owner_type TEXT    NOT NULL CHECK (owner_type IN ('note', 'task')),
    owner_id   INTEGER NOT NULL,
    filename   TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_attachments_owner ON attachments(owner_type, owner_id);
  `
```

- [ ] **Step 2: Add the shared type**

Add at the end of `src/shared/types.ts`:

```ts
export interface Attachment {
  id: number
  kind: 'file' | 'audio'
  owner_type: 'note' | 'task'
  owner_id: number
  filename: string
  created_at: string
}
```

- [ ] **Step 3: Verify the migration runs, and fix the two hardcoded `user_version` assertions**

Run: `npm test`
Expected: FAIL — `test/db.test.ts` has two assertions hardcoding `user_version` to `4` (the same issue hit for every migration so far). Update both to `5`:

```bash
sed -i "s/pragma('user_version', { simple: true }), 4)/pragma('user_version', { simple: true }), 5)/" test/db.test.ts
```

Run: `npm test` again, and `npm run typecheck`.
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/main/db/migrations.ts src/shared/types.ts test/db.test.ts
git commit -m "Add attachments table (migration 005) and shared Attachment type"
```

---

### Task 2: `attachments.ts` query module

**Files:**
- Create: `src/main/db/queries/attachments.ts`
- Test: `test/attachments.test.ts`

**Interfaces:**
- Consumes: `Attachment` from Task 1.
- Produces: `attachmentsDir(): string`, `listAttachments(ownerType, ownerId): Attachment[]`, `createAttachment(input): Attachment`, `addFileAttachment(ownerType, ownerId, sourcePath): Attachment`, `attachmentPath(id): string | null`, `readAttachmentBase64(id): string | null`, `deleteAttachment(id): void` — consumed by Task 3 (main-process glue) and Task 4 (IPC).

- [ ] **Step 1: Write the failing test**

Create `test/attachments.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx esbuild test/attachments.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/attachments.test.mjs`
Expected: FAIL — cannot find module `../src/main/db/queries/attachments`.

- [ ] **Step 3: Implement `src/main/db/queries/attachments.ts`**

```ts
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, copyFileSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { getDb } from '../connection'
import type { Attachment } from '../../../shared/types'

/**
 * Where attachment files live on disk. ORYN_ATTACHMENTS_DIR wins, which lets
 * this module run outside Electron (tests, scripts) — same override pattern
 * dbPath() in connection.ts already uses. Electron is required lazily for
 * the same reason.
 */
export function attachmentsDir(): string {
  const override = process.env.ORYN_ATTACHMENTS_DIR
  if (override) return override
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')
  return join(app.getPath('userData'), 'attachments')
}

function rowPath(id: number, filename: string): string {
  return join(attachmentsDir(), `${id}${extname(filename)}`)
}

export function listAttachments(ownerType: 'note' | 'task', ownerId: number): Attachment[] {
  return getDb()
    .prepare(
      'SELECT * FROM attachments WHERE owner_type = ? AND owner_id = ? ORDER BY created_at'
    )
    .all(ownerType, ownerId) as Attachment[]
}

/** Saves base64-encoded bytes to disk and records the attachment row. */
export function createAttachment(input: {
  kind: 'file' | 'audio'
  ownerType: 'note' | 'task'
  ownerId: number
  filename: string
  dataBase64: string
}): Attachment {
  const db = getDb()
  mkdirSync(attachmentsDir(), { recursive: true })
  const { lastInsertRowid } = db
    .prepare('INSERT INTO attachments (kind, owner_type, owner_id, filename) VALUES (?, ?, ?, ?)')
    .run(input.kind, input.ownerType, input.ownerId, input.filename)
  const id = lastInsertRowid as number
  writeFileSync(rowPath(id, input.filename), Buffer.from(input.dataBase64, 'base64'))
  return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Attachment
}

/** Copies an existing file (e.g. from a native file picker) into the store. */
export function addFileAttachment(
  ownerType: 'note' | 'task',
  ownerId: number,
  sourcePath: string
): Attachment {
  const db = getDb()
  mkdirSync(attachmentsDir(), { recursive: true })
  const filename = basename(sourcePath)
  const { lastInsertRowid } = db
    .prepare('INSERT INTO attachments (kind, owner_type, owner_id, filename) VALUES (?, ?, ?, ?)')
    .run('file', ownerType, ownerId, filename)
  const id = lastInsertRowid as number
  copyFileSync(sourcePath, rowPath(id, filename))
  return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Attachment
}

export function attachmentPath(id: number): string | null {
  const row = getDb().prepare('SELECT filename FROM attachments WHERE id = ?').get(id) as
    | { filename: string }
    | undefined
  if (!row) return null
  return rowPath(id, row.filename)
}

export function readAttachmentBase64(id: number): string | null {
  const path = attachmentPath(id)
  if (!path || !existsSync(path)) return null
  return readFileSync(path).toString('base64')
}

export function deleteAttachment(id: number): void {
  const path = attachmentPath(id)
  getDb().prepare('DELETE FROM attachments WHERE id = ?').run(id)
  if (path && existsSync(path)) unlinkSync(path)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx esbuild test/attachments.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/attachments.test.mjs`
Expected: PASS, `4 checks passed`.

- [ ] **Step 5: Add `attachments.test.ts` to the `test` script**

In `package.json`, update `"test"` to include the new file in both the esbuild call and the run list:

```json
"test": "esbuild test/db.test.ts test/logic.test.ts test/phase3.test.ts test/search.test.ts test/tags.test.ts test/links.test.ts test/reminders.test.ts test/automation.test.ts test/insights.test.ts test/lock.test.ts test/attachments.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/db.test.mjs && node out/test/logic.test.mjs && node out/test/phase3.test.mjs && node out/test/search.test.mjs && node out/test/tags.test.mjs && node out/test/links.test.mjs && node out/test/reminders.test.mjs && node out/test/automation.test.mjs && node out/test/insights.test.mjs && node out/test/lock.test.mjs && node out/test/attachments.test.mjs"
```

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/queries/attachments.ts test/attachments.test.ts package.json
git commit -m "Add attachments query module: store, list, read, delete"
```

---

### Task 3: Main-process glue — file picker and "open" (Electron-only, untested)

**Files:**
- Create: `src/main/attachments.ts`

**Interfaces:**
- Consumes: `addFileAttachment`, `attachmentPath` from Task 2.
- Produces: `pickAndAttachFile(ownerType: 'note' | 'task', ownerId: number): Promise<Attachment | null>`, `openAttachment(id: number): void` — consumed by Task 4 (IPC).

This file imports from `'electron'` (`dialog`, `shell`, `BrowserWindow`), so — matching `capture.ts`/`backup.ts`/`reminders.ts` — it has no automated test; it's verified by typecheck now.

- [ ] **Step 1: Implement `src/main/attachments.ts`**

```ts
import { dialog, shell, BrowserWindow } from 'electron'
import { addFileAttachment, attachmentPath } from './db/queries/attachments'
import type { Attachment } from '../shared/types'

/** Opens a native file picker; returns null if the user cancels. */
export async function pickAndAttachFile(
  ownerType: 'note' | 'task',
  ownerId: number
): Promise<Attachment | null> {
  const win = BrowserWindow.getFocusedWindow() ?? undefined
  const result = win
    ? await dialog.showOpenDialog(win, { properties: ['openFile'] })
    : await dialog.showOpenDialog({ properties: ['openFile'] })
  if (result.canceled || result.filePaths.length === 0) return null
  return addFileAttachment(ownerType, ownerId, result.filePaths[0])
}

/** Opens an attachment's file with whatever the OS has associated with it. */
export function openAttachment(id: number): void {
  const path = attachmentPath(id)
  if (path) void shell.openPath(path)
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/main/attachments.ts
git commit -m "Add attachments main-process glue: file picker and open"
```

---

### Task 4: Wire `attachments:*` through IPC and preload

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `listAttachments`, `createAttachment`, `readAttachmentBase64`, `deleteAttachment` from Task 2; `pickAndAttachFile`, `openAttachment` from Task 3.
- Produces: `window.oryn.attachments.{list,createAudio,addFile,read,open,delete}` — consumed by Tasks 6 and 7.

- [ ] **Step 1: Register the handlers in `src/main/ipc.ts`**

Add the imports:

```ts
import * as attachmentsDb from './db/queries/attachments'
import { pickAndAttachFile, openAttachment } from './attachments'
```

Add to the `handlers` map, after the `lock:*` group:

```ts
  'attachments:list': attachmentsDb.listAttachments,
  'attachments:createAudio': (ownerId: number, dataBase64: string) =>
    attachmentsDb.createAttachment({
      kind: 'audio',
      ownerType: 'note',
      ownerId,
      filename: `voice-${Date.now()}.webm`,
      dataBase64
    }),
  'attachments:addFile': pickAndAttachFile,
  'attachments:read': attachmentsDb.readAttachmentBase64,
  'attachments:open': openAttachment,
  'attachments:delete': attachmentsDb.deleteAttachment,
```

- [ ] **Step 2: Expose them in `src/preload/index.ts`**

Add a new top-level key after `lock`:

```ts
  attachments: {
    list: invoke('attachments:list'),
    createAudio: invoke('attachments:createAudio'),
    addFile: invoke('attachments:addFile'),
    read: invoke('attachments:read'),
    open: invoke('attachments:open'),
    delete: invoke('attachments:delete')
  },
```

- [ ] **Step 3: Type them in `src/preload/index.d.ts`**

Add `Attachment` to the type import:

```ts
  ReviewSummary,
  HabitCorrelation,
  Attachment
} from '../shared/types'
```

Add a new block after `lock`:

```ts
  attachments: {
    list(ownerType: 'note' | 'task', ownerId: number): Promise<Attachment[]>
    createAudio(ownerId: number, dataBase64: string): Promise<Attachment>
    addFile(ownerType: 'note' | 'task', ownerId: number): Promise<Attachment | null>
    read(id: number): Promise<string | null>
    open(id: number): Promise<void>
    delete(id: number): Promise<void>
  }
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "Wire attachments:* through IPC and preload"
```

---

### Task 5: Images in notes via BlockNote's `uploadFile`

**Files:**
- Modify: `src/renderer/src/components/Editor.tsx`

**Interfaces:** none new — this task is self-contained, renderer-only, no `attachments` table involvement (see Global Constraints).

- [ ] **Step 1: Add a `uploadFile` handler that returns a data URL**

In `src/renderer/src/components/Editor.tsx`, add a helper above the `Editor` component:

```ts
/**
 * BlockNote's uploadFile just needs a URL back. A data: URL — the pasted
 * image's own bytes, base64-encoded — works directly in an <img> tag with
 * no file on disk, no custom protocol, and no IPC round-trip. ponytail: no
 * size limit or compression, so a very large paste bloats this note's
 * content_json; add a cap only if that turns out to matter in practice.
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
```

Update the `useCreateBlockNote` call:

```ts
  const editor = useCreateBlockNote({ initialContent: parsed, uploadFile: fileToDataUrl }, [
    noteId
  ])
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Open a note, paste or drag an image into it. Confirm it appears inline and persists after switching away and back to the note.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Editor.tsx
git commit -m "Images in notes: BlockNote uploadFile returns a data URL"
```

---

### Task 6: Files on tasks

**Files:**
- Create: `src/renderer/src/components/TaskAttachments.tsx`
- Modify: `src/renderer/src/components/TaskRow.tsx`

**Interfaces:**
- Consumes: `window.oryn.attachments.{list,addFile,open,delete}` from Task 4.

- [ ] **Step 1: Implement `src/renderer/src/components/TaskAttachments.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react'
import { PaperclipIcon, Trash2Icon } from 'lucide-react'
import type { Attachment } from '../../../shared/types'

export function TaskAttachments({ taskId }: { taskId: number }): React.JSX.Element {
  const [files, setFiles] = useState<Attachment[]>([])

  const refresh = useCallback(async () => {
    setFiles(await window.oryn.attachments.list('task', taskId))
  }, [taskId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addFile = async (): Promise<void> => {
    const added = await window.oryn.attachments.addFile('task', taskId)
    if (added) await refresh()
  }

  const remove = async (id: number): Promise<void> => {
    await window.oryn.attachments.delete(id)
    await refresh()
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {files.map((f) => (
        <span
          key={f.id}
          className="flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-[13px] text-muted"
        >
          <button
            onClick={() => void window.oryn.attachments.open(f.id)}
            className="max-w-[140px] truncate hover:text-text"
            title={f.filename}
          >
            {f.filename}
          </button>
          <button onClick={() => void remove(f.id)} aria-label={`Remove ${f.filename}`}>
            <Trash2Icon className="size-3 hover:text-danger" />
          </button>
        </span>
      ))}
      <button
        onClick={() => void addFile()}
        className="flex items-center gap-1 text-[13px] text-faint hover:text-text"
      >
        <PaperclipIcon className="size-3.5" /> Attach file
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Mount it in the expanded task row**

In `src/renderer/src/components/TaskRow.tsx`, add the import:

```ts
import { TaskAttachments } from './TaskAttachments'
```

Add it at the end of the expanded block, right after the "Add a subtask…" input and before the closing `</div>` of that block:

```tsx
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addSubtask()}
            placeholder="Add a subtask…"
            className="mt-1 w-full bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
          <TaskAttachments taskId={task.id} />
        </div>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Expand a task, click "Attach file", pick any file. Confirm it appears as a chip; clicking the chip opens it in the OS's default app for that file type, and the trash icon removes it.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/TaskAttachments.tsx src/renderer/src/components/TaskRow.tsx
git commit -m "Add file attachments to tasks"
```

---

### Task 7: Voice notes on notes

**Files:**
- Create: `src/renderer/src/components/VoiceNotes.tsx`
- Modify: `src/renderer/src/views/Notes.tsx`

**Interfaces:**
- Consumes: `window.oryn.attachments.{list,createAudio,read,delete}` from Task 4. Browser's native `MediaRecorder`/`navigator.mediaDevices.getUserMedia` — no dependency.

- [ ] **Step 1: Implement `src/renderer/src/components/VoiceNotes.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { MicIcon, SquareIcon, Trash2Icon } from 'lucide-react'
import type { Attachment } from '../../../shared/types'

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function VoiceNotes({ noteId }: { noteId: number }): React.JSX.Element {
  const [clips, setClips] = useState<Attachment[]>([])
  const [recording, setRecording] = useState(false)
  const [urls, setUrls] = useState<Record<number, string>>({})
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const refresh = useCallback(async () => {
    setClips(await window.oryn.attachments.list('note', noteId))
  }, [noteId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      clips.map(async (c) => {
        const base64 = await window.oryn.attachments.read(c.id)
        return [c.id, base64 ? `data:audio/webm;base64,${base64}` : null] as const
      })
    ).then((pairs) => {
      if (cancelled) return
      setUrls(Object.fromEntries(pairs.filter((p): p is [number, string] => p[1] != null)))
    })
    return () => {
      cancelled = true
    }
  }, [clips])

  const start = async (): Promise<void> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const base64 = await blobToBase64(blob)
      await window.oryn.attachments.createAudio(noteId, base64)
      await refresh()
    }
    recorder.start()
    recorderRef.current = recorder
    setRecording(true)
  }

  const stop = (): void => {
    recorderRef.current?.stop()
    setRecording(false)
  }

  const remove = async (id: number): Promise<void> => {
    await window.oryn.attachments.delete(id)
    await refresh()
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2 text-[13px] uppercase tracking-wider text-faint">
        Voice notes
        <button
          onClick={() => void (recording ? stop() : start())}
          className={`ml-auto flex items-center gap-1 rounded-md border px-2 py-1 text-[13px] normal-case tracking-normal ${
            recording ? 'border-danger text-danger' : 'border-border text-muted hover:text-text'
          }`}
        >
          {recording ? <SquareIcon className="size-3.5" /> : <MicIcon className="size-3.5" />}
          {recording ? 'Stop' : 'Record'}
        </button>
      </div>
      {clips.length === 0 && !recording && (
        <p className="text-[13px] text-faint">No voice notes yet.</p>
      )}
      <div className="flex flex-col gap-1.5">
        {clips.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            {urls[c.id] && <audio controls src={urls[c.id]} className="h-8 flex-1" />}
            <button onClick={() => void remove(c.id)} aria-label="Delete voice note">
              <Trash2Icon className="size-3.5 text-faint hover:text-danger" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount it below the Linked mentions panel in `Notes.tsx`**

In `src/renderer/src/views/Notes.tsx`, add the import:

```ts
import { VoiceNotes } from '../components/VoiceNotes'
```

Find the closing of the "Linked mentions" conditional block (added by the Backlinks feature) and add `<VoiceNotes noteId={note.id} />` right after it, still inside the same scrollable `<div className="flex-1 overflow-y-auto py-4">` wrapper as the editor:

```tsx
              {backlinks.length > 0 && (
                <div className="mx-auto mt-6 w-full max-w-3xl border-t border-border px-[54px] pt-4">
                  <div className="mb-2 text-[13px] uppercase tracking-wider text-faint">
                    Linked mentions
                  </div>
                  <div className="flex flex-col gap-1">
                    {backlinks.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => setNote(n.id)}
                        className="rounded-md px-2 py-1.5 text-left text-[15px] text-muted hover:bg-surface hover:text-text"
                      >
                        {n.title || 'Untitled'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mx-auto w-full max-w-3xl px-[54px]">
                <VoiceNotes noteId={note.id} />
              </div>
            </div>
          </>
        ) : (
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Open a note, click "Record", speak briefly, click "Stop" (the OS will prompt for microphone permission the first time). Confirm a playable clip appears; play it back, then delete it.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/VoiceNotes.tsx src/renderer/src/views/Notes.tsx
git commit -m "Add voice notes to notes"
```

---

### Task 8: Final full-suite check

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 2: No commit needed** — this task only verifies the tree left by Task 7 is green.
