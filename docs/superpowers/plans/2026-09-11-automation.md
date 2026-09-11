# Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three independent task/habit automations: checklist templates you can spawn into a day, missed tasks that automatically roll to today, and a due-date suggestion when adding a task with a familiar title.

**Architecture:** Each is a small, separate addition on top of the existing `tasks.ts` query module (and one new `templates.ts` module) — no shared machinery between the three beyond that. Templates get a new table + a Settings panel. Carry-over is one `UPDATE` run once at app launch. Due-date suggestion is one read-only query surfaced as a dismissible hint in the existing "add a task" form.

**Tech Stack:** better-sqlite3 (main process), React (renderer). No new dependencies.

## Global Constraints

- No new npm dependencies.
- Never edit migrations 001-003 — this is a real, already-migrated local database. `templates` is migration 004.
- Follow the existing IPC pattern: entries in `src/main/ipc.ts`'s `handlers` map, mirrored in `src/preload/index.ts`'s `api`, typed in `src/preload/index.d.ts`'s `OrynApi`.
- Backend query functions use parameterized (`?`) placeholders only, never string-concatenated user input.
- Tests run via `npm test`; add the new test file to the `test` script in `package.json` (both the esbuild bundle list and the `node` run list).
- Carry-over and due-date suggestion stay in `tasks.ts` (small, tasks-specific additions) rather than new files — templates gets its own file because it owns a new table and a meaningfully separate set of operations (list/create/delete/spawn).
- Per the original design note, due-date suggestion is the weakest of the three — ship it, but keep it a dismissible hint the user can ignore, never a value that silently overrides what they typed.

---

### Task 1: `templates` table (migration 004)

**Files:**
- Modify: `src/main/db/migrations.ts`

**Interfaces:**
- Produces: table `templates(id, title, items_json, created_at)` — consumed by Task 2.

- [ ] **Step 1: Append the migration**

In `src/main/db/migrations.ts`, add a fourth array entry after the note-links migration (insert a comma and a new entry before the closing `]`):

```ts
  ,
  // 004 - checklist templates
  `
  CREATE TABLE templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    items_json TEXT    NOT NULL DEFAULT '[]',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  `
```

- [ ] **Step 2: Verify the migration runs, and fix the two hardcoded `user_version` assertions**

Run: `npm test`
Expected: FAIL — `test/db.test.ts` has two assertions hardcoding `user_version` to `3` (the same issue hit for migrations 002 and 003). Update both to `4`:

```bash
sed -i "s/pragma('user_version', { simple: true }), 3)/pragma('user_version', { simple: true }), 4)/" test/db.test.ts
```

Run: `npm test` again.
Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/main/db/migrations.ts test/db.test.ts
git commit -m "Add templates table (migration 004)"
```

---

### Task 2: `templates.ts` — list, create, delete, spawn

**Files:**
- Create: `src/main/db/queries/templates.ts`
- Modify: `src/shared/types.ts`
- Test: `test/automation.test.ts`

**Interfaces:**
- Produces: `Template { id: number; title: string; items: string[]; created_at: string }` (shared type), `listTemplates(): Template[]`, `createTemplate(title: string, items: string[]): Template`, `deleteTemplate(id: number): void`, `spawnTemplate(id: number, spaceId: number, date?: string): Task[]` — consumed by Task 5 (IPC) and Task 6 (Settings UI).

- [ ] **Step 1: Add the shared `Template` type**

Add to the end of `src/shared/types.ts`:

```ts
export interface Template {
  id: number
  title: string
  items: string[]
  created_at: string
}
```

- [ ] **Step 2: Write the failing test**

Create `test/automation.test.ts`:

```ts
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx esbuild test/automation.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/automation.test.mjs`
Expected: FAIL — cannot find module `../src/main/db/queries/templates`.

- [ ] **Step 4: Implement `src/main/db/queries/templates.ts`**

```ts
import { getDb } from '../connection'
import { createTask } from './tasks'
import { today } from '../../../shared/dates'
import type { Template, Task } from '../../../shared/types'

export type { Template }

function toTemplate(row: { id: number; title: string; items_json: string; created_at: string }): Template {
  let items: string[] = []
  try {
    const parsed = JSON.parse(row.items_json)
    if (Array.isArray(parsed)) items = parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    items = []
  }
  return { id: row.id, title: row.title, items, created_at: row.created_at }
}

export function listTemplates(): Template[] {
  const rows = getDb()
    .prepare('SELECT * FROM templates ORDER BY created_at DESC')
    .all() as { id: number; title: string; items_json: string; created_at: string }[]
  return rows.map(toTemplate)
}

export function createTemplate(title: string, items: string[]): Template {
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO templates (title, items_json) VALUES (?, ?)')
    .run(title, JSON.stringify(items))
  return toTemplate(
    db.prepare('SELECT * FROM templates WHERE id = ?').get(lastInsertRowid) as {
      id: number
      title: string
      items_json: string
      created_at: string
    }
  )
}

export function deleteTemplate(id: number): void {
  getDb().prepare('DELETE FROM templates WHERE id = ?').run(id)
}

/** Spawns one top-level task per template item, all due on the given date. */
export function spawnTemplate(id: number, spaceId: number, date?: string): Task[] {
  const db = getDb()
  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as
    | { id: number; title: string; items_json: string; created_at: string }
    | undefined
  if (!row) return []
  const template = toTemplate(row)
  const dueDate = date ?? today()
  return template.items.map((title) => createTask({ spaceId, title, dueDate }))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx esbuild test/automation.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/automation.test.mjs`
Expected: PASS, `3 checks passed`.

- [ ] **Step 6: Add `automation.test.ts` to the `test` script**

In `package.json`, update `"test"` to include the new file in both the esbuild call and the run list:

```json
"test": "esbuild test/db.test.ts test/logic.test.ts test/phase3.test.ts test/search.test.ts test/tags.test.ts test/links.test.ts test/reminders.test.ts test/automation.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/db.test.mjs && node out/test/logic.test.mjs && node out/test/phase3.test.mjs && node out/test/search.test.mjs && node out/test/tags.test.mjs && node out/test/links.test.mjs && node out/test/reminders.test.mjs && node out/test/automation.test.mjs"
```

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/db/queries/templates.ts test/automation.test.ts package.json
git commit -m "Add templates query module: list, create, delete, spawn"
```

---

### Task 3: Auto-carry-over of missed tasks

**Files:**
- Modify: `src/main/db/queries/tasks.ts`
- Modify: `src/main/index.ts`
- Test: `test/automation.test.ts` (extend)

**Interfaces:**
- Produces: `carryOverMissedTasks(date?: string): number` (returns the count of tasks bumped) — consumed by Task 3's own `index.ts` wiring.

- [ ] **Step 1: Extend the failing test**

Add to `test/automation.test.ts`, alongside the existing imports:

```ts
const tasks = await import('../src/main/db/queries/tasks')
const { addDays, today } = await import('../src/shared/dates')
```

And these checks before the final `console.log`/`finally`:

```ts
  const day = today()

  check('carryOverMissedTasks bumps an overdue, undone, non-recurring task to today', () => {
    const t = tasks.createTask({ spaceId: academic, title: 'Overdue thing', dueDate: addDays(day, -5) })
    const moved = tasks.carryOverMissedTasks(day)
    assert.ok(moved >= 1)
    const reloaded = tasks.listTasks({ spaceId: academic, scope: 'all' }).find((x) => x.id === t.id)
    assert.equal(reloaded!.due_date, day)
  })

  check('carryOverMissedTasks leaves a recurring task alone', () => {
    const t = tasks.createTask({
      spaceId: academic,
      title: 'Recurring overdue',
      dueDate: addDays(day, -5),
      recurRule: 'daily'
    })
    tasks.carryOverMissedTasks(day)
    const reloaded = tasks.listTasks({ spaceId: academic, scope: 'all' }).find((x) => x.id === t.id)
    assert.equal(reloaded!.due_date, addDays(day, -5))
  })

  check('carryOverMissedTasks leaves a done task alone', () => {
    const t = tasks.createTask({ spaceId: academic, title: 'Finished late', dueDate: addDays(day, -5) })
    tasks.toggleTask(t.id, day)
    tasks.carryOverMissedTasks(day)
    const reloaded = tasks.listTasks({ spaceId: academic, scope: 'all' }).find((x) => x.id === t.id)
    assert.equal(reloaded!.due_date, addDays(day, -5))
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx esbuild test/automation.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/automation.test.mjs`
Expected: FAIL — `tasks.carryOverMissedTasks` is not a function.

- [ ] **Step 3: Implement `carryOverMissedTasks` in `src/main/db/queries/tasks.ts`**

Add to the end of the file:

```ts
/**
 * Bumps overdue, undone, non-recurring tasks to the given date. Recurring
 * tasks already spawn a fresh instance on completion (see toggleTask) and
 * shouldn't also carry over, or a missed recurring task would end up
 * duplicated. Run once at app launch (see src/main/index.ts).
 */
export function carryOverMissedTasks(date?: string): number {
  const day = date ?? today()
  const { changes } = getDb()
    .prepare(
      `UPDATE tasks SET due_date = ?, updated_at = datetime('now')
       WHERE status != 'done' AND due_date IS NOT NULL AND due_date < ? AND recur_rule IS NULL`
    )
    .run(day, day)
  return changes
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx esbuild test/automation.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/automation.test.mjs`
Expected: PASS, `6 checks passed`.

- [ ] **Step 5: Wire it into app launch**

In `src/main/index.ts`, add the import:

```ts
import { carryOverMissedTasks } from './db/queries/tasks'
```

Inside `app.whenReady().then(() => { ... })`, right after `getDb()`:

```ts
    getDb() // opens the file and runs migrations before any IPC can arrive
    carryOverMissedTasks()
    registerIpc()
```

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/db/queries/tasks.ts src/main/index.ts test/automation.test.ts
git commit -m "Auto-carry-over missed, non-recurring tasks to today on launch"
```

---

### Task 4: Due-date suggestion

**Files:**
- Modify: `src/main/db/queries/tasks.ts`
- Test: `test/automation.test.ts` (extend)

**Interfaces:**
- Produces: `suggestDueDate(spaceId: number, title: string): string | null` — consumed by Task 5 (IPC) and Task 7 (Tasks view UI).

- [ ] **Step 1: Extend the failing test**

Add these checks before the final `console.log`/`finally`:

```ts
  check('suggestDueDate returns null with no history for that title', () => {
    assert.equal(tasks.suggestDueDate(academic, 'Something never seen before'), null)
  })

  check('suggestDueDate returns null for a blank title', () => {
    assert.equal(tasks.suggestDueDate(academic, '   '), null)
  })

  check('suggestDueDate suggests a date based on past completion gaps for a similar title', () => {
    // Three past "Pay rent" tasks, each completed 2 days after creation.
    for (let i = 0; i < 3; i++) {
      const created = addDays(day, -30 + i)
      const t = tasks.createTask({ spaceId: academic, title: 'Pay rent', dueDate: created })
      getDb()
        .prepare("UPDATE tasks SET created_at = ? WHERE id = ?")
        .run(`${created} 00:00:00`, t.id)
      tasks.toggleTask(t.id, addDays(created, 2))
      getDb()
        .prepare("UPDATE tasks SET completed_at = ? WHERE id = ?")
        .run(`${addDays(created, 2)} 00:00:00`, t.id)
    }
    const suggested = tasks.suggestDueDate(academic, 'Pay rent')
    assert.equal(suggested, addDays(day, 2))
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx esbuild test/automation.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/automation.test.mjs`
Expected: FAIL — `tasks.suggestDueDate` is not a function.

- [ ] **Step 3: Implement `suggestDueDate` in `src/main/db/queries/tasks.ts`**

Add to the end of the file:

```ts
/**
 * Suggests a due date for a new task by looking at the median day-gap
 * between creation and completion for past done tasks with a similar title
 * in the same space. Returns null with no history to go on — this is a
 * hint, never a forced value.
 */
export function suggestDueDate(spaceId: number, title: string): string | null {
  const text = title.trim()
  if (!text) return null
  const term = `%${text.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const rows = getDb()
    .prepare(
      `SELECT
         julianday(date(completed_at, 'localtime')) - julianday(date(created_at, 'localtime')) AS gap
       FROM tasks
       WHERE space_id = ? AND status = 'done' AND title LIKE ? ESCAPE '\\'
       ORDER BY gap`
    )
    .all(spaceId, term) as { gap: number }[]
  if (rows.length === 0) return null
  const medianGap = rows[Math.floor(rows.length / 2)].gap
  return addDays(today(), Math.max(0, Math.round(medianGap)))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx esbuild test/automation.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/automation.test.mjs`
Expected: PASS, `9 checks passed`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all files pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/queries/tasks.ts test/automation.test.ts
git commit -m "Add suggestDueDate based on past completion gaps for similar titles"
```

---

### Task 5: Wire templates and suggestDueDate through IPC and preload

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `listTemplates`, `createTemplate`, `deleteTemplate`, `spawnTemplate` from Task 2; `suggestDueDate` from Task 4.
- Produces: `window.oryn.templates.{list,create,delete,spawn}`, `window.oryn.tasks.suggestDueDate` — consumed by Tasks 6 and 7.

- [ ] **Step 1: Register the handlers in `src/main/ipc.ts`**

Add the import:

```ts
import * as templates from './db/queries/templates'
```

Add to the `handlers` map, in a new group after `tags:list`:

```ts
  'templates:list': templates.listTemplates,
  'templates:create': templates.createTemplate,
  'templates:delete': templates.deleteTemplate,
  'templates:spawn': templates.spawnTemplate,
```

Add to the existing `tasks:*` group:

```ts
  'tasks:counts': tasks.taskCounts,
  'tasks:suggestDueDate': tasks.suggestDueDate,
```

- [ ] **Step 2: Expose them in `src/preload/index.ts`**

Add a new top-level key after `tags`:

```ts
  templates: {
    list: invoke('templates:list'),
    create: invoke('templates:create'),
    delete: invoke('templates:delete'),
    spawn: invoke('templates:spawn')
  },
```

Add to the existing `tasks` block:

```ts
    counts: invoke('tasks:counts'),
    suggestDueDate: invoke('tasks:suggestDueDate')
```

- [ ] **Step 3: Type them in `src/preload/index.d.ts`**

Add `Template` to the type import:

```ts
  GlobalSearchResult,
  Tag,
  Template
} from '../shared/types'
```

Add a new block after `tags`:

```ts
  templates: {
    list(): Promise<Template[]>
    create(title: string, items: string[]): Promise<Template>
    delete(id: number): Promise<void>
    spawn(id: number, spaceId: number, date?: string): Promise<Task[]>
  }
```

Add to the existing `tasks` block, after `counts`:

```ts
    counts(
      date?: string,
      spaceId?: number | null
    ): Promise<{ due: number; overdue: number; done: number }>
    suggestDueDate(spaceId: number, title: string): Promise<string | null>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "Wire templates:* and tasks:suggestDueDate through IPC and preload"
```

---

### Task 6: Checklist templates panel in Settings

**Files:**
- Modify: `src/renderer/src/views/Settings.tsx`

**Interfaces:**
- Consumes: `window.oryn.templates.{list,create,delete,spawn}` from Task 5.

- [ ] **Step 1: Add state, loading, and the create/delete/spawn handlers**

In `src/renderer/src/views/Settings.tsx`, add to the imports:

```ts
import type { Template } from '../../../shared/types'
```

Add state and a load effect inside `SettingsView`, alongside the existing `useState`/`useEffect` calls:

```ts
  const { spaces, activeSpaceId } = useStore()
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateTitle, setTemplateTitle] = useState('')
  const [templateItems, setTemplateItems] = useState('')

  const refreshTemplates = async (): Promise<void> => {
    setTemplates(await window.oryn.templates.list())
  }

  useEffect(() => {
    void refreshTemplates()
  }, [])

  const addTemplate = async (): Promise<void> => {
    const title = templateTitle.trim()
    const items = templateItems
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!title || items.length === 0) return
    await window.oryn.templates.create(title, items)
    setTemplateTitle('')
    setTemplateItems('')
    await refreshTemplates()
  }

  const removeTemplate = async (id: number): Promise<void> => {
    await window.oryn.templates.delete(id)
    await refreshTemplates()
  }

  const spawnTemplate = async (id: number): Promise<void> => {
    const target = activeSpaceId ?? spaces.find((s) => !s.is_system)?.id
    if (target == null) return
    await window.oryn.templates.spawn(id, target)
    setStatus('Added to today.')
  }
```

(`useStore` is already imported at the top of this file — only the destructured fields above are new, so merge them into the existing `const { theme, toggleTheme, zoom, setZoom } = useStore()` line rather than adding a second `useStore()` call: `const { theme, toggleTheme, zoom, setZoom, spaces, activeSpaceId } = useStore()`.)

- [ ] **Step 2: Render the panel**

Add a new section at the end of the JSX returned by `SettingsView`, using the same `Row`/section pattern the rest of the file uses. Find the closing of the existing settings sections and add before the final closing tag of the view:

```tsx
        <h2 className="mb-1 mt-6 text-[15px] font-medium text-faint">Checklist templates</h2>
        <div className="rounded-lg border border-border bg-surface p-3">
          <input
            value={templateTitle}
            onChange={(e) => setTemplateTitle(e.target.value)}
            placeholder="Template name, e.g. Morning routine"
            className="w-full bg-transparent px-1 py-1 text-[15px] outline-none placeholder:text-faint"
          />
          <textarea
            value={templateItems}
            onChange={(e) => setTemplateItems(e.target.value)}
            placeholder={'One item per line'}
            rows={3}
            className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-[14px] outline-none placeholder:text-faint focus:border-accent"
          />
          <button onClick={() => void addTemplate()} className={`${BUTTON} mt-2`}>
            Add template
          </button>

          {templates.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px]">{t.title}</div>
                    <div className="text-[12px] text-faint">{t.items.length} items</div>
                  </div>
                  <button onClick={() => void spawnTemplate(t.id)} className={BUTTON}>
                    Add to today
                  </button>
                  <button onClick={() => void removeTemplate(t.id)} className={BUTTON}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
```

Place this block just before the closing `</div>` / `)` that ends the component's returned JSX (match the file's existing indentation and wrapper structure — it's a top-level section alongside the other settings groups already in the file).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. In Settings, create a template "Morning routine" with items "Stretch", "Journal". Click "Add to today" and confirm two new tasks appear in the Tasks view, due today.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/views/Settings.tsx
git commit -m "Add checklist templates panel to Settings"
```

---

### Task 7: Due-date suggestion hint in the Tasks add form

**Files:**
- Modify: `src/renderer/src/views/Tasks.tsx`

**Interfaces:**
- Consumes: `window.oryn.tasks.suggestDueDate` from Task 5.

- [ ] **Step 1: Add suggestion state and a debounced lookup on title change**

In `src/renderer/src/views/Tasks.tsx`, add state near the existing `title`/`due` state:

```ts
  const [suggestion, setSuggestion] = useState<string | null>(null)
```

Add an effect that looks up a suggestion when the title changes, debounced, and only while the due date is still empty (so it never second-guesses a date the user already picked):

```ts
  useEffect(() => {
    if (!title.trim() || due) {
      setSuggestion(null)
      return
    }
    const target = activeSpaceId ?? spaces.find((s) => !s.is_system)?.id
    if (target == null) return
    const t = setTimeout(() => {
      void window.oryn.tasks.suggestDueDate(target, title).then(setSuggestion)
    }, 400)
    return () => clearTimeout(t)
  }, [title, due, activeSpaceId, spaces])
```

- [ ] **Step 2: Render the hint next to the due-date input**

Find the due-date `<input type="date" ...>` in the add-task form and add the hint right after its closing `/>`:

```tsx
            {suggestion && (
              <button
                type="button"
                onClick={() => {
                  setDue(suggestion)
                  setSuggestion(null)
                }}
                className="rounded border border-dashed border-border px-1.5 py-1 text-muted hover:border-accent hover:text-text"
              >
                Suggest: {suggestion}
              </button>
            )}
```

- [ ] **Step 3: Clear the suggestion after adding a task**

In the `add` function, after `setTitle('')`, add:

```ts
    setSuggestion(null)
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Create and complete a task titled "Pay rent" a few days after its due date more than once (or seed similar data), then start typing "Pay rent" into a new task with no due date set — confirm a "Suggest: <date>" hint appears and clicking it fills the due-date field.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/views/Tasks.tsx
git commit -m "Show a due-date suggestion hint when adding a task with a familiar title"
```

---

### Task 8: Final full-suite check

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 2: No commit needed** — this task only verifies the tree left by Task 7 is green.
