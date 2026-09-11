# Backlinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing `[[Note Title]]` anywhere in a note links it to that note; the target note shows a "Linked mentions" panel listing every note that references it.

**Architecture:** A derived `note_links` table (source note → target note), rebuilt on every note save by parsing `[[...]]` tokens out of the note's title+body and resolving each to a note by case-insensitive title match — the exact same derive-on-save shape Tags already uses (`syncNoteTags`/`tags.ts`), just for links instead of tags. `Notes.tsx` gains a read-only "Linked mentions" list below the editor.

**Tech Stack:** better-sqlite3 (main process), React (renderer). No new dependencies.

## Global Constraints

- No new npm dependencies.
- Never edit migration 001 or 002 — this is a real, already-migrated local database. `note_links` is migration 003, appended to the `migrations` array in `src/main/db/migrations.ts`.
- Follow the existing IPC pattern: one entry in `src/main/ipc.ts`'s `handlers` map, mirrored in `src/preload/index.ts`'s `api`, typed in `src/preload/index.d.ts`'s `OrynApi`.
- Backend query functions use parameterized (`?`) placeholders only, never string-concatenated user input.
- Tests run via `npm test`; add the new test file to the `test` script in `package.json` (both the esbuild bundle list and the `node` run list).
- **Deviation from the original one-line design note in `FUTURE_WORK.md`:** that note described a BlockNote custom inline-content type with a live `[[` autocomplete suggestion menu — a real BlockNote schema-customization project (custom node type, serialization, a `SuggestionMenuController`). Tags proved a much lazier approach already works well: parse plain `#tag` tokens out of the note's flattened text on save, no editor plugin. Backlinks use the identical approach — parse `[[Note Title]]` out of plain text on save, resolve by title lookup. **This means no live autocomplete while typing `[[`** — you type the literal title between double brackets, same as Obsidian/wiki-link syntax predates any editor tooling for it. If that's a real gap once this is in use, autocomplete can be added later as its own follow-up; it would only touch the editor, not this data layer.
- Link resolution is by exact, case-insensitive title match. An unresolved title (typo, or the target note doesn't exist yet) is silently skipped — no "broken link" tracking, same as an unresolved `#tag` search just returns nothing.
- A note cannot link to itself; self-references are excluded during resolution.

---

### Task 1: `note_links` table (migration 003)

**Files:**
- Modify: `src/main/db/migrations.ts`

**Interfaces:**
- Produces: table `note_links(source_id, target_id)` — consumed by Task 2.

- [ ] **Step 1: Append the migration**

In `src/main/db/migrations.ts`, add a third array entry after the tags migration (the array currently ends with the tags migration's closing backtick then `]` — insert a comma and a new entry before the closing `]`):

```ts
  ,
  // 003 - note links
  `
  CREATE TABLE note_links (
    source_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    PRIMARY KEY (source_id, target_id)
  );
  CREATE INDEX idx_note_links_target ON note_links(target_id);
  `
```

- [ ] **Step 2: Verify the migration runs**

Run: `npm test`
Expected: all existing tests still pass (every test file opens a fresh temp DB, so this exercises the new migration on every run).

- [ ] **Step 3: Commit**

```bash
git add src/main/db/migrations.ts
git commit -m "Add note_links table (migration 003)"
```

---

### Task 2: `links.ts` query module — parse, resolve, sync, list backlinks

**Files:**
- Create: `src/main/db/queries/links.ts`
- Test: `test/links.test.ts`

**Interfaces:**
- Consumes: table from Task 1, `NoteSummary` (existing, from `src/shared/types.ts`).
- Produces:
  - `parseLinks(text: string): string[]`
  - `syncNoteLinks(noteId: number, text: string): void`
  - `listBacklinks(noteId: number): NoteSummary[]`

  — all consumed by Task 3 (notes.ts wiring) and Task 4 (IPC).

- [ ] **Step 1: Write the failing test**

Create `test/links.test.ts`:

```ts
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

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx esbuild test/links.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/links.test.mjs`
Expected: FAIL — cannot find module `../src/main/db/queries/links`.

- [ ] **Step 3: Implement `src/main/db/queries/links.ts`**

```ts
import { getDb } from '../connection'
import type { NoteSummary } from '../../../shared/types'

/** Extracts and trims [[Reference]] tokens from text. */
export function parseLinks(text: string): string[] {
  const matches = [...text.matchAll(/\[\[([^[\]]+)\]\]/g)]
  return matches.map((m) => m[1].trim())
}

/**
 * Replaces the outgoing link set for one note with whatever [[references]]
 * are currently in its text, resolved by case-insensitive title match.
 * Delete-then-insert mirrors syncNoteTags in tags.ts — these sets are always
 * small, so diffing isn't worth the extra code. An unresolved title (typo,
 * or the target doesn't exist) is silently skipped; a note cannot link to
 * itself.
 */
export function syncNoteLinks(noteId: number, text: string): void {
  const db = getDb()
  const titles = parseLinks(text)
  const findByTitle = db.prepare(
    `SELECT id FROM notes WHERE lower(title) = lower(?) AND id != ? ORDER BY updated_at DESC LIMIT 1`
  )
  const targetIds = [
    ...new Set(
      titles
        .map((title) => (findByTitle.get(title, noteId) as { id: number } | undefined)?.id)
        .filter((id): id is number => id != null)
    )
  ]

  db.transaction(() => {
    db.prepare('DELETE FROM note_links WHERE source_id = ?').run(noteId)
    const insert = db.prepare('INSERT INTO note_links (source_id, target_id) VALUES (?, ?)')
    for (const targetId of targetIds) insert.run(noteId, targetId)
  })()
}

const BACKLINK_SUMMARY_COLS = `
  n.id, n.space_id, n.title, n.is_pinned, n.archived_at, n.created_at, n.updated_at,
  substr(n.content_text, 1, 140) AS excerpt
`

/** Notes that link to this one, i.e. its incoming [[references]]. */
export function listBacklinks(noteId: number): NoteSummary[] {
  return getDb()
    .prepare(
      `SELECT ${BACKLINK_SUMMARY_COLS} FROM note_links nl
       JOIN notes n ON n.id = nl.source_id
       WHERE nl.target_id = ?
       ORDER BY n.title`
    )
    .all(noteId) as NoteSummary[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx esbuild test/links.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/links.test.mjs`
Expected: PASS, `6 checks passed`.

- [ ] **Step 5: Add `links.test.ts` to the `test` script**

In `package.json`, update `"test"` to include the new file in both the esbuild call and the run list (alongside the existing `search.test.ts` and `tags.test.ts`):

```json
"test": "esbuild test/db.test.ts test/logic.test.ts test/phase3.test.ts test/search.test.ts test/tags.test.ts test/links.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/db.test.mjs && node out/test/logic.test.mjs && node out/test/phase3.test.mjs && node out/test/search.test.mjs && node out/test/tags.test.mjs && node out/test/links.test.mjs"
```

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/queries/links.ts test/links.test.ts package.json
git commit -m "Add links query module: parse, resolve, sync, list backlinks"
```

---

### Task 3: Sync links on note save

**Files:**
- Modify: `src/main/db/queries/notes.ts`
- Test: `test/links.test.ts` (extend)

**Interfaces:**
- Consumes: `syncNoteLinks` from Task 2.

- [ ] **Step 1: Extend the failing test**

Add to `test/links.test.ts` before the final `console.log`/`finally`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx esbuild test/links.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/links.test.mjs`
Expected: FAIL — the three new checks fail because nothing calls `syncNoteLinks` on save yet.

- [ ] **Step 3: Wire it into `notes.ts`**

In `src/main/db/queries/notes.ts`, add the import alongside the existing `syncNoteTags` import:

```ts
import { syncNoteTags } from './tags'
import { syncNoteLinks } from './links'
```

In `createNote`, call it alongside the existing `syncNoteTags` call:

```ts
  if (input.title) {
    syncNoteTags(lastInsertRowid as number, input.title)
    syncNoteLinks(lastInsertRowid as number, input.title)
  }
```

In `updateNote`, call it alongside the existing post-update `syncNoteTags` block:

```ts
  if (patch.title !== undefined || patch.contentText !== undefined) {
    const row = getDb().prepare('SELECT title, content_text FROM notes WHERE id = ?').get(id) as {
      title: string
      content_text: string
    }
    syncNoteTags(id, `${row.title} ${row.content_text}`)
    syncNoteLinks(id, `${row.title} ${row.content_text}`)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx esbuild test/links.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/links.test.mjs`
Expected: PASS, `9 checks passed`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all files pass, including `tags.test.ts` (confirms both sync calls coexist without interfering).

- [ ] **Step 6: Commit**

```bash
git add src/main/db/queries/notes.ts test/links.test.ts
git commit -m "Sync note backlinks on save"
```

---

### Task 4: Wire `notes:backlinks` through IPC and preload

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `listBacklinks` from Task 2.
- Produces: `window.oryn.notes.backlinks(noteId: number): Promise<NoteSummary[]>` — consumed by Task 5.

- [ ] **Step 1: Register the handler in `src/main/ipc.ts`**

Add the import:

```ts
import * as links from './db/queries/links'
```

Add to the `handlers` map, inside the `notes:*` group:

```ts
  'notes:search': notes.searchNotes,
  'notes:backlinks': links.listBacklinks,
```

- [ ] **Step 2: Expose it in `src/preload/index.ts`**

Add to the existing `notes` block:

```ts
  notes: {
    list: invoke('notes:list'),
    get: invoke('notes:get'),
    create: invoke('notes:create'),
    update: invoke('notes:update'),
    archive: invoke('notes:archive'),
    delete: invoke('notes:delete'),
    search: invoke('notes:search'),
    backlinks: invoke('notes:backlinks')
  },
```

- [ ] **Step 3: Type it in `src/preload/index.d.ts`**

Add to the `notes` block in `OrynApi`:

```ts
  notes: {
    list(opts?: {
      spaceId?: number | null
      archived?: boolean
      tagId?: number | null
    }): Promise<NoteSummary[]>
    get(id: number): Promise<Note | undefined>
    create(input: { spaceId: number; title?: string }): Promise<Note>
    update(id: number, patch: NotePatch): Promise<void>
    archive(id: number, archived?: boolean): Promise<void>
    delete(id: number): Promise<void>
    search(query: string, spaceId?: number | null): Promise<NoteSummary[]>
    backlinks(noteId: number): Promise<NoteSummary[]>
  }
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "Wire notes:backlinks through IPC and preload"
```

---

### Task 5: "Linked mentions" panel in Notes view

**Files:**
- Modify: `src/renderer/src/views/Notes.tsx`

**Interfaces:**
- Consumes: `window.oryn.notes.backlinks` from Task 4.

- [ ] **Step 1: Load backlinks when the open note changes**

In `src/renderer/src/views/Notes.tsx`, add state and extend the existing note-loading effect. Replace:

```ts
  useEffect(() => {
    if (activeNoteId == null) {
      setNoteData(null)
      return
    }
    void window.oryn.notes.get(activeNoteId).then((n) => setNoteData(n ?? null))
  }, [activeNoteId])
```

with:

```ts
  const [backlinks, setBacklinks] = useState<NoteSummary[]>([])

  useEffect(() => {
    if (activeNoteId == null) {
      setNoteData(null)
      setBacklinks([])
      return
    }
    void window.oryn.notes.get(activeNoteId).then((n) => setNoteData(n ?? null))
    void window.oryn.notes.backlinks(activeNoteId).then(setBacklinks)
  }, [activeNoteId])
```

(`NoteSummary` is already imported at the top of this file from the tags work — no import change needed.)

- [ ] **Step 2: Render the panel below the editor**

Replace:

```tsx
            <div className="flex-1 overflow-y-auto py-4">
              <Editor
                key={note.id}
                noteId={note.id}
                initialContent={note.content_json}
                theme={theme}
                onSave={save}
              />
            </div>
```

with:

```tsx
            <div className="flex-1 overflow-y-auto py-4">
              <Editor
                key={note.id}
                noteId={note.id}
                initialContent={note.content_json}
                theme={theme}
                onSave={save}
              />
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
            </div>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Create note A titled "Grocery List". Create note B, type `See [[Grocery List]] for details` in its body, wait for the 500ms autosave. Open note A and confirm "Linked mentions" shows note B; clicking it navigates to B.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/views/Notes.tsx
git commit -m "Add Linked mentions panel to the Notes view"
```

---

### Task 6: Final full-suite check

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 2: No commit needed** — this task only verifies the tree left by Task 5 is green.
