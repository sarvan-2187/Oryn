# Global Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Cmd+K command palette to search notes, tasks, habits, and journal entries (currently notes-only), grouped by type.

**Architecture:** One new backend query module (`search.ts`) fans out to the existing `searchNotes` (FTS5) plus new `LIKE`-based lookups for tasks/habits/journal, returned as a single grouped result over one IPC call. The palette renders one `cmdk` group per type. Selecting a task or habit result stores a "focus" id in the zustand store; the target view reads it, switches to a scope that's guaranteed to show the item, scrolls it into view, and briefly highlights it.

**Tech Stack:** Electron + better-sqlite3 (main process), React + zustand + `cmdk` (renderer). No new dependencies.

## Global Constraints

- No new npm dependencies — everything reuses `better-sqlite3`, `cmdk`, `zustand`, already-installed.
- Follow the existing IPC pattern: one entry in `src/main/ipc.ts`'s `handlers` map, mirrored in `src/preload/index.ts`'s `api`, typed in `src/preload/index.d.ts`'s `OrynApi`.
- Row shapes shared between main and renderer go in `src/shared/types.ts` only.
- Tests run via `npm test`, which bundles `test/*.test.ts` files with esbuild and runs each as a plain Node script (`assert` + a `check(name, fn)` helper) — see `test/phase3.test.ts` for the exact style to match.
- Backend query functions never trust raw user input into SQL string concatenation — always parameterized (`?`) placeholders, as the rest of `src/main/db/queries/*.ts` already does.

---

### Task 1: Shared types for search results

**Files:**
- Modify: `src/shared/types.ts`

**Interfaces:**
- Produces: `TaskSearchResult`, `HabitSearchResult`, `JournalSearchResult`, `GlobalSearchResult` — consumed by Task 2 (backend) and Task 5 (frontend).

- [ ] **Step 1: Add the four interfaces to `src/shared/types.ts`**

Add at the end of the file:

```ts
export interface TaskSearchResult {
  id: number
  title: string
  status: TaskStatus
  due_date: string | null
}

export interface HabitSearchResult {
  id: number
  name: string
}

export interface JournalSearchResult {
  date: string
  excerpt: string
}

export interface GlobalSearchResult {
  notes: NoteSummary[]
  tasks: TaskSearchResult[]
  habits: HabitSearchResult[]
  journal: JournalSearchResult[]
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes (these are unused exports so far, which is fine — TS doesn't flag unused exported types).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "Add shared types for global search results"
```

---

### Task 2: `searchJournal` query function

**Files:**
- Modify: `src/main/db/queries/journal.ts`
- Test: `test/search.test.ts` (created here, extended in Task 3)

**Interfaces:**
- Consumes: `JournalSearchResult` from Task 1.
- Produces: `searchJournal(likeTerm: string): JournalSearchResult[]` — consumed by Task 3.

The existing `getJournal` creates an empty row for a date if none exists, which is wrong for search (it would spam the table with empty rows for every date a user types while searching). This is a separate, read-only query.

- [ ] **Step 1: Write the failing test**

Create `test/search.test.ts`:

```ts
/**
 * Global search: journal LIKE lookup, task/habit LIKE lookups, and the
 * combined globalSearch() fan-out.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-search-'))
process.env.ORYN_DB_PATH = join(dir, 'test.db')

const { getDb, closeDb } = await import('../src/main/db/connection')
const spaces = await import('../src/main/db/queries/spaces')
const journal = await import('../src/main/db/queries/journal')

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

try {
  getDb()
  spaces.listSpaces() // seeds the default spaces, same as other test files rely on

  check('searchJournal finds a matching entry by content, case-insensitively', () => {
    journal.saveJournal('2026-01-01', '[]', 'Went for a long Run this morning')
    journal.saveJournal('2026-01-02', '[]', 'Nothing notable')
    const rows = journal.searchJournal('%run%')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].date, '2026-01-01')
    assert.match(rows[0].excerpt, /Run/)
  })

  check('searchJournal does not match empty entries', () => {
    journal.saveJournal('2026-01-03', '[]', '')
    const rows = journal.searchJournal('%2026%')
    assert.ok(rows.every((r) => r.date !== '2026-01-03'))
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx esbuild test/search.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/search.test.mjs`
Expected: FAIL — `journal.searchJournal is not a function`.

- [ ] **Step 3: Implement `searchJournal` in `src/main/db/queries/journal.ts`**

Add to the bottom of the file:

```ts
/**
 * Read-only content search. Separate from getJournal, which creates an empty
 * row for any date that doesn't exist yet — wrong behaviour while searching.
 * `term` is a caller-supplied LIKE pattern (already wrapped in `%...%` and
 * escaped), so this function stays a thin, parameterized query.
 */
export function searchJournal(term: string): JournalSearchResult[] {
  return getDb()
    .prepare(
      `SELECT date, substr(content_text, 1, 140) AS excerpt FROM journal
       WHERE content_text LIKE ? ESCAPE '\\' AND content_text != ''
       ORDER BY date DESC LIMIT 5`
    )
    .all(term) as JournalSearchResult[]
}
```

Add `JournalSearchResult` to the existing type import at the top of the file:

```ts
import type { JournalEntry, JournalSearchResult } from '../../../shared/types'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx esbuild test/search.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/search.test.mjs`
Expected: PASS, `2 checks passed`.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/queries/journal.ts test/search.test.ts
git commit -m "Add searchJournal query function"
```

---

### Task 3: `globalSearch` fan-out query module

**Files:**
- Create: `src/main/db/queries/search.ts`
- Test: `test/search.test.ts` (extend from Task 2)

**Interfaces:**
- Consumes: `searchNotes` from `src/main/db/queries/notes.ts` (existing, signature `(query: string, spaceId?: number | null) => NoteSummary[]`), `searchJournal` from Task 2, `GlobalSearchResult`/`TaskSearchResult`/`HabitSearchResult` from Task 1.
- Produces: `globalSearch(query: string, spaceId?: number | null): GlobalSearchResult` — consumed by Task 4 (IPC wiring).

- [ ] **Step 1: Extend the failing test**

Append to `test/search.test.ts`, adding the new imports at the top alongside the existing ones:

```ts
const tasks = await import('../src/main/db/queries/tasks')
const habits = await import('../src/main/db/queries/habits')
const notes = await import('../src/main/db/queries/notes')
const search = await import('../src/main/db/queries/search')
```

And these checks before the final `console.log`/`finally`:

```ts
  const academic = spaces.listSpaces()[0].id
  const research = spaces.listSpaces()[1].id

  check('globalSearch finds matches across all four sources', () => {
    tasks.createTask({ spaceId: academic, title: 'Refactor the search index' })
    habits.createHabit({ spaceId: academic, name: 'Search for meaning daily' })
    notes.createNote({ spaceId: academic, title: 'Search notes' })
    journal.saveJournal('2026-02-01', '[]', 'Spent the day on search UX')

    const r = search.globalSearch('search', null)
    assert.equal(r.tasks.length, 1)
    assert.equal(r.tasks[0].title, 'Refactor the search index')
    assert.equal(r.habits.length, 1)
    assert.equal(r.habits[0].name, 'Search for meaning daily')
    assert.equal(r.notes.length, 1)
    assert.equal(r.journal.length, 1)
  })

  check('globalSearch scopes tasks and habits to a space, but not journal', () => {
    tasks.createTask({ spaceId: research, title: 'Search papers for citations' })
    const r = search.globalSearch('search', academic)
    assert.ok(r.tasks.every((t) => t.title !== 'Search papers for citations'))
    // Journal has no space_id column, so it's never scoped.
    assert.equal(r.journal.length, 1)
  })

  check('globalSearch returns empty groups for a blank query instead of everything', () => {
    const r = search.globalSearch('   ', null)
    assert.deepEqual(r, { notes: [], tasks: [], habits: [], journal: [] })
  })

  check("globalSearch escapes LIKE wildcards so '%' can't match everything", () => {
    const r = search.globalSearch('%', null)
    assert.equal(r.tasks.length, 0)
    assert.equal(r.habits.length, 0)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx esbuild test/search.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/search.test.mjs`
Expected: FAIL — cannot find module `../src/main/db/queries/search`.

- [ ] **Step 3: Implement `src/main/db/queries/search.ts`**

```ts
import { getDb } from '../connection'
import { searchNotes } from './notes'
import { searchJournal } from './journal'
import type {
  TaskSearchResult,
  HabitSearchResult,
  GlobalSearchResult
} from '../../../shared/types'

const LIMIT = 5

/**
 * Wraps a raw query as a LIKE pattern, escaping the characters LIKE treats
 * specially so user input like "50% off" or "a_b" can't behave as a wildcard.
 * Paired with `ESCAPE '\'` in every query that uses this.
 */
function likeTerm(raw: string): string {
  return `%${raw.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
}

function searchTasks(term: string, spaceId?: number | null): TaskSearchResult[] {
  const where = ["parent_id IS NULL", "(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')"]
  const params: unknown[] = [term, term]
  if (spaceId != null) {
    where.push('space_id = ?')
    params.push(spaceId)
  }
  return getDb()
    .prepare(
      `SELECT id, title, status, due_date FROM tasks WHERE ${where.join(' AND ')}
       ORDER BY updated_at DESC LIMIT ${LIMIT}`
    )
    .all(...params) as TaskSearchResult[]
}

function searchHabits(term: string, spaceId?: number | null): HabitSearchResult[] {
  const where = ["is_active = 1", "name LIKE ? ESCAPE '\\'"]
  const params: unknown[] = [term]
  if (spaceId != null) {
    where.push('space_id = ?')
    params.push(spaceId)
  }
  return getDb()
    .prepare(
      `SELECT id, name FROM habits WHERE ${where.join(' AND ')} ORDER BY sort_order LIMIT ${LIMIT}`
    )
    .all(...params) as HabitSearchResult[]
}

/**
 * Fans out one query across notes (FTS5), tasks, habits and journal (all
 * plain LIKE — these tables stay small for a personal app, so an FTS index
 * isn't worth the upkeep). Tasks/habits respect the active space filter;
 * journal never does, since journal entries have no space_id.
 */
export function globalSearch(query: string, spaceId?: number | null): GlobalSearchResult {
  const q = query.trim()
  if (!q) return { notes: [], tasks: [], habits: [], journal: [] }
  const term = likeTerm(q)
  return {
    notes: searchNotes(q, spaceId).slice(0, LIMIT),
    tasks: searchTasks(term, spaceId),
    habits: searchHabits(term, spaceId),
    journal: searchJournal(term)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx esbuild test/search.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/search.test.mjs`
Expected: PASS, `6 checks passed`.

- [ ] **Step 5: Add `search.test.ts` to the `test` script and run the full suite**

In `package.json`, update the `"test"` script to include the new file in both the esbuild call and the run list:

```json
"test": "esbuild test/db.test.ts test/logic.test.ts test/phase3.test.ts test/search.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/db.test.mjs && node out/test/logic.test.mjs && node out/test/phase3.test.mjs && node out/test/search.test.mjs"
```

Run: `npm test`
Expected: all four test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/queries/search.ts test/search.test.ts package.json
git commit -m "Add globalSearch query module fanning out across notes/tasks/habits/journal"
```

---

### Task 4: Wire `search:global` through IPC and preload

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `globalSearch` from Task 3.
- Produces: `window.oryn.search.global(query: string, spaceId?: number | null): Promise<GlobalSearchResult>` — consumed by Task 6 (CommandPalette).

- [ ] **Step 1: Register the handler in `src/main/ipc.ts`**

Add the import near the other query module imports:

```ts
import * as search from './db/queries/search'
```

Add to the `handlers` map, near the other top-level entries (after `'notes:search'` reads naturally):

```ts
  'search:global': search.globalSearch,
```

- [ ] **Step 2: Expose it in `src/preload/index.ts`**

Add a new top-level key to the `api` object, after `notes`:

```ts
  search: {
    global: invoke('search:global')
  },
```

- [ ] **Step 3: Type it in `src/preload/index.d.ts`**

Add `GlobalSearchResult` to the type import at the top of the file:

```ts
import type {
  Space,
  Note,
  NoteSummary,
  NotePatch,
  Task,
  TaskTree,
  TaskPatch,
  Priority,
  RecurRule,
  Habit,
  HabitToday,
  HabitStats,
  HabitKind,
  JournalEntry,
  ActivityMetric,
  ActivityResult,
  Deadline,
  DeadlineKind,
  ClassSlot,
  Capture,
  GlobalSearchResult
} from '../shared/types'
```

Add to the `OrynApi` interface, after the `notes` block:

```ts
  search: {
    global(query: string, spaceId?: number | null): Promise<GlobalSearchResult>
  }
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "Wire search:global through IPC and preload"
```

---

### Task 5: Store support for focusing a task/habit from search

**Files:**
- Modify: `src/renderer/src/store.ts`

**Interfaces:**
- Produces: `focusTaskId: number | null`, `setFocusTaskId(id: number | null): void`, `focusHabitId: number | null`, `setFocusHabitId(id: number | null): void` on `useStore` — consumed by Task 6 (CommandPalette sets them), Task 7 (TasksView reads/clears `focusTaskId`), Task 8 (HabitsView reads/clears `focusHabitId`).

These mirror the existing `activeNoteId`/`setNote` pair — same "which item should the target view land on" role, just for tasks and habits instead of notes.

- [ ] **Step 1: Add the fields to the `State` interface**

In `src/renderer/src/store.ts`, add after `activeNoteId: number | null`:

```ts
  /** Set when a search result should be scrolled to and highlighted once the target view mounts. */
  focusTaskId: number | null
  focusHabitId: number | null
```

And after `setNote: (id: number | null) => void`:

```ts
  setFocusTaskId: (id: number | null) => void
  setFocusHabitId: (id: number | null) => void
```

- [ ] **Step 2: Add the defaults and implementations**

After `activeNoteId: null,` in the store body:

```ts
  focusTaskId: null,
  focusHabitId: null,
```

After `setNote: (id) => set({ activeNoteId: id }),`:

```ts
  setFocusTaskId: (id) => set({ focusTaskId: id }),
  setFocusHabitId: (id) => set({ focusHabitId: id }),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store.ts
git commit -m "Add focusTaskId/focusHabitId to the store for search result navigation"
```

---

### Task 6: Extend CommandPalette with grouped global search

**Files:**
- Modify: `src/renderer/src/components/CommandPalette.tsx`

**Interfaces:**
- Consumes: `window.oryn.search.global` from Task 4, `focusTaskId`/`setFocusTaskId`/`focusHabitId`/`setFocusHabitId` from Task 5, `setView` (existing).

- [ ] **Step 1: Replace the notes-only fetch with the grouped search**

Replace the imports at the top:

```ts
import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { useStore, type View } from '../store'
import type { GlobalSearchResult } from '../../../shared/types'
```

Replace the `notes` state and its fetch effect:

```ts
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult>({
    notes: [],
    tasks: [],
    habits: [],
    journal: []
  })

  // Search runs in the main process, so cmdk's own filtering stays off and
  // the action list is filtered here against the same query.
  useEffect(() => {
    if (!paletteOpen) return
    let cancelled = false
    const run = async (): Promise<void> => {
      const q = query.trim()
      if (!q) {
        const rows = await window.oryn.notes.list({ spaceId: null })
        if (!cancelled) setResults({ notes: rows.slice(0, 20), tasks: [], habits: [], journal: [] })
        return
      }
      const r = await window.oryn.search.global(q, activeSpaceId)
      if (!cancelled) setResults(r)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [query, paletteOpen, activeSpaceId])
```

- [ ] **Step 2: Add navigation handlers for task/habit/journal results**

Add alongside the existing `openNote` function:

```ts
  const { setFocusTaskId, setFocusHabitId } = useStore()

  const openTask = (id: number): void => {
    setView('tasks')
    setFocusTaskId(id)
    close()
  }

  const openHabit = (id: number): void => {
    setView('habits')
    setFocusHabitId(id)
    close()
  }

  // Journal is date-keyed with no per-date browsing view (Dashboard only ever
  // shows today's entry), so the best this can do is land on Dashboard —
  // it'll only actually show the match if the entry is today's.
  const openJournal = (): void => {
    setView('dashboard')
    close()
  }
```

Add `setFocusTaskId`/`setFocusHabitId` to the destructured `useStore()` call at the top of the component instead of the separate call above — i.e. change:

```ts
  const {
    paletteOpen,
    setPalette,
    spaces,
    setSpace,
    setView,
    setNote,
    toggleTheme,
    activeSpaceId
  } = useStore()
```

to:

```ts
  const {
    paletteOpen,
    setPalette,
    spaces,
    setSpace,
    setView,
    setNote,
    toggleTheme,
    activeSpaceId,
    setFocusTaskId,
    setFocusHabitId
  } = useStore()
```

(and remove the separate `useStore()` call added above the handlers, since it's now redundant).

- [ ] **Step 3: Update the `visibleActions`/empty-state check and render the new groups**

Change the empty check and notes reference to use `results.notes`, and add three new `Command.Group` blocks after the existing Notes group:

```tsx
          <Command.List className="max-h-[340px] overflow-y-auto p-2">
            {visibleActions.length === 0 &&
              results.notes.length === 0 &&
              results.tasks.length === 0 &&
              results.habits.length === 0 &&
              results.journal.length === 0 && (
                <div className="px-3 py-6 text-center text-[16px] text-faint">Nothing found.</div>
              )}

            {visibleActions.length > 0 && (
              <Command.Group heading="Actions" className={GROUP_HEADING}>
                {visibleActions.map((a) => (
                  <Item key={a.id} value={a.id} onSelect={a.run}>
                    {a.label}
                  </Item>
                ))}
              </Command.Group>
            )}

            {results.notes.length > 0 && (
              <Command.Group heading="Notes" className={GROUP_HEADING}>
                {results.notes.map((n) => (
                  <Item key={n.id} value={`note-${n.id}`} onSelect={() => openNote(n.id)}>
                    <span className="truncate">{n.title || 'Untitled'}</span>
                    <span className="ml-2 truncate text-[15px] text-faint">{n.excerpt}</span>
                  </Item>
                ))}
              </Command.Group>
            )}

            {results.tasks.length > 0 && (
              <Command.Group heading="Tasks" className={GROUP_HEADING}>
                {results.tasks.map((t) => (
                  <Item key={t.id} value={`task-${t.id}`} onSelect={() => openTask(t.id)}>
                    <span className="truncate">{t.title}</span>
                    {t.due_date && (
                      <span className="ml-2 truncate text-[15px] text-faint">{t.due_date}</span>
                    )}
                  </Item>
                ))}
              </Command.Group>
            )}

            {results.habits.length > 0 && (
              <Command.Group heading="Habits" className={GROUP_HEADING}>
                {results.habits.map((h) => (
                  <Item key={h.id} value={`habit-${h.id}`} onSelect={() => openHabit(h.id)}>
                    <span className="truncate">{h.name}</span>
                  </Item>
                ))}
              </Command.Group>
            )}

            {results.journal.length > 0 && (
              <Command.Group heading="Journal" className={GROUP_HEADING}>
                {results.journal.map((j) => (
                  <Item key={j.date} value={`journal-${j.date}`} onSelect={openJournal}>
                    <span className="truncate">{j.date}</span>
                    <span className="ml-2 truncate text-[15px] text-faint">{j.excerpt}</span>
                  </Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`
In the app: press Ctrl+K, type a query that matches a task, a habit, and a journal entry (create test data first if needed via the UI). Confirm all four groups render with the right rows, and each `Enter`/click navigates and closes the palette.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/CommandPalette.tsx
git commit -m "Show tasks, habits and journal results in the command palette"
```

---

### Task 7: Scroll-to and highlight a task from search in TasksView

**Files:**
- Modify: `src/renderer/src/components/TaskRow.tsx`
- Modify: `src/renderer/src/views/Tasks.tsx`

**Interfaces:**
- Consumes: `focusTaskId`/`setFocusTaskId` from Task 5.
- Produces: `TaskRow` gains an optional `highlighted?: boolean` prop.

- [ ] **Step 1: Add a DOM anchor id and a `highlighted` prop to `TaskRow`**

In `src/renderer/src/components/TaskRow.tsx`, update the `Props` interface:

```ts
interface Props {
  task: TaskTree
  onChanged: () => void
  highlighted?: boolean
}
```

Update the function signature:

```ts
export function TaskRow({ task, onChanged, highlighted }: Props): React.JSX.Element {
```

Add `id={`task-${task.id}`}` and a conditional ring class to both wrapper `<div>`s that currently read `className="border-b border-border/60 last:border-0"` (the `editing` branch and the normal branch) — change each to:

```tsx
    <div
      id={`task-${task.id}`}
      className={`border-b border-border/60 last:border-0 transition-shadow ${
        highlighted ? 'ring-2 ring-inset ring-accent' : ''
      }`}
    >
```

- [ ] **Step 2: Read and clear `focusTaskId` in `TasksView`**

In `src/renderer/src/views/Tasks.tsx`, update the store destructure:

```ts
  const { activeSpaceId, spaces, focusTaskId, setFocusTaskId } = useStore()
```

Add a `highlightId` state and two effects after the existing `refresh`/`useEffect` block:

```ts
  const [highlightId, setHighlightId] = useState<number | null>(null)

  // A search result can point at a task outside the current scope (e.g. an
  // "upcoming" task while viewing "Today"), so force the scope wide enough
  // to guarantee it's actually in the list before trying to scroll to it.
  useEffect(() => {
    if (focusTaskId != null) setScope('all')
  }, [focusTaskId])

  useEffect(() => {
    if (focusTaskId == null) return
    const el = document.getElementById(`task-${focusTaskId}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setHighlightId(focusTaskId)
    setFocusTaskId(null)
    const t = setTimeout(() => setHighlightId(null), 1500)
    return () => clearTimeout(t)
  }, [tasks, focusTaskId, setFocusTaskId])
```

Pass `highlighted` down where `TaskRow` is rendered (both the `open` and `done` lists):

```tsx
              {open.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onChanged={() => void refresh()}
                  highlighted={t.id === highlightId}
                />
              ))}
```

```tsx
                  {done.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onChanged={() => void refresh()}
                      highlighted={t.id === highlightId}
                    />
                  ))}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Create a task with a due date more than a week out (so it's outside the default "Today" scope). Search for it via Ctrl+K and select it. Confirm the Tasks view switches to "All", scrolls to the task, and briefly shows an accent ring around it.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/TaskRow.tsx src/renderer/src/views/Tasks.tsx
git commit -m "Scroll to and highlight a task opened from search"
```

---

### Task 8: Scroll-to and highlight a habit from search in HabitsView

**Files:**
- Modify: `src/renderer/src/views/Habits.tsx`

**Interfaces:**
- Consumes: `focusHabitId`/`setFocusHabitId` from Task 5.

HabitsView always lists every active habit (no scope tabs like Tasks), so this is simpler than Task 7 — no scope-switching step needed.

- [ ] **Step 1: Read and clear `focusHabitId`, add the DOM anchor and highlight**

In `src/renderer/src/views/Habits.tsx`, update the store destructure at the top of `HabitsView`:

```ts
  const { activeSpaceId, spaces, focusHabitId, setFocusHabitId } = useStore()
```

Add a `highlightId` state and an effect after the existing `refresh`/`useEffect` block:

```ts
  const [highlightId, setHighlightId] = useState<number | null>(null)

  useEffect(() => {
    if (focusHabitId == null) return
    const el = document.getElementById(`habit-${focusHabitId}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setHighlightId(focusHabitId)
    setFocusHabitId(null)
    const t = setTimeout(() => setHighlightId(null), 1500)
    return () => clearTimeout(t)
  }, [habits, focusHabitId, setFocusHabitId])
```

Update the habit row wrapper (currently `<div key={h.id} className="group rounded-lg border border-border bg-surface p-3">`) to add the id and conditional ring:

```tsx
              <div
                key={h.id}
                id={`habit-${h.id}`}
                className={`group rounded-lg border border-border bg-surface p-3 transition-shadow ${
                  highlightId === h.id ? 'ring-2 ring-inset ring-accent' : ''
                }`}
              >
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Create several habits (enough to require scrolling), search for one further down the list via Ctrl+K, select it, and confirm the Habits view scrolls to it and briefly highlights it.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/views/Habits.tsx
git commit -m "Scroll to and highlight a habit opened from search"
```

---

### Task 9: Update the palette placeholder copy and do a final full-suite check

**Files:**
- Modify: `src/renderer/src/components/CommandPalette.tsx`

- [ ] **Step 1: Update the input placeholder**

Change:

```tsx
            placeholder="Search notes or run a command…"
```

to:

```tsx
            placeholder="Search everything or run a command…"
```

- [ ] **Step 2: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/CommandPalette.tsx
git commit -m "Update command palette placeholder for global search"
```
