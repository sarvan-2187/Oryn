# Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native OS notification once a day when there are tasks due today or a habit streak worth protecting is unchecked.

**Architecture:** A pure, testable function (`buildReminderSummary`) reuses the existing `listTasks`/`habitsForDate`/`habitStats` queries to decide what's worth a nudge — no new tables for that. A separate, Electron-only glue module (`src/main/reminders.ts`, following the same split `capture.ts`/`backup.ts` already use) turns that into a native `Notification`, gated to once per calendar day via a new generic `settings` key-value module (the `settings` table already exists in the schema but nothing has used it yet).

**Tech Stack:** Electron's built-in `Notification` API (main process only — no new dependency), better-sqlite3.

## Global Constraints

- No new npm dependencies.
- Backend query functions use parameterized (`?`) placeholders only, never string-concatenated user input.
- Tests run via `npm test`; add the new test file to the `test` script in `package.json` (both the esbuild bundle list and the `node` run list).
- Anything that imports from `'electron'` cannot be exercised by the `npm test` node-script suite (that's how the existing `capture.ts`/`backup.ts` already work — no unit tests for them, Electron isn't available outside the real app). Keep the decision logic (what to notify about) Electron-free and tested; keep the actual `Notification` call in a thin, untested glue file, matching that existing split.
- **One notification per calendar day, not one per hourly check.** The original one-line design note ("checked once on launch + hourly") didn't say what stops it firing every single hour forever — that would make the feature actively annoying rather than useful. A `reminders.lastNotifiedDate` row in `settings` gates it: once a day's notification has fired, later checks that same day are no-ops.
- `ponytail:` cut corner, noted inline in the code: the at-risk streak threshold is a fixed constant (3 days), not a user setting. Add a Settings UI control for it if 3 turns out to be the wrong number for how this is actually used.

---

### Task 1: `settings.ts` — generic key-value get/set

**Files:**
- Create: `src/main/db/queries/settings.ts`
- Test: `test/reminders.test.ts` (created here, extended in Task 2)

**Interfaces:**
- Produces: `getSetting(key: string): string | undefined`, `setSetting(key: string, value: string): void` — consumed by Task 3 (the Electron glue module).

- [ ] **Step 1: Write the failing test**

Create `test/reminders.test.ts`:

```ts
/** Settings get/set, and the pure reminder-summary decision logic. */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'oryn-reminders-'))
process.env.ORYN_DB_PATH = join(dir, 'test.db')

const { getDb, closeDb } = await import('../src/main/db/connection')
const spaces = await import('../src/main/db/queries/spaces')
const settings = await import('../src/main/db/queries/settings')

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

try {
  getDb()
  spaces.listSpaces() // seeds the default spaces, same as other test files rely on

  check('getSetting returns undefined for a key that was never set', () => {
    assert.equal(settings.getSetting('nope'), undefined)
  })

  check('setSetting then getSetting round-trips the value', () => {
    settings.setSetting('reminders.lastNotifiedDate', '2026-01-01')
    assert.equal(settings.getSetting('reminders.lastNotifiedDate'), '2026-01-01')
  })

  check('setSetting overwrites rather than erroring on an existing key', () => {
    settings.setSetting('reminders.lastNotifiedDate', '2026-01-01')
    settings.setSetting('reminders.lastNotifiedDate', '2026-01-02')
    assert.equal(settings.getSetting('reminders.lastNotifiedDate'), '2026-01-02')
  })

  console.log(`\n${passed} checks passed`)
} finally {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx esbuild test/reminders.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/reminders.test.mjs`
Expected: FAIL — cannot find module `../src/main/db/queries/settings`.

- [ ] **Step 3: Implement `src/main/db/queries/settings.ts`**

```ts
import { getDb } from '../connection'

export function getSetting(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx esbuild test/reminders.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/reminders.test.mjs`
Expected: PASS, `3 checks passed`.

- [ ] **Step 5: Add `reminders.test.ts` to the `test` script**

In `package.json`, update `"test"` to include the new file in both the esbuild call and the run list (alongside the existing `search.test.ts`, `tags.test.ts`, `links.test.ts`):

```json
"test": "esbuild test/db.test.ts test/logic.test.ts test/phase3.test.ts test/search.test.ts test/tags.test.ts test/links.test.ts test/reminders.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/db.test.mjs && node out/test/logic.test.mjs && node out/test/phase3.test.mjs && node out/test/search.test.mjs && node out/test/tags.test.mjs && node out/test/links.test.mjs && node out/test/reminders.test.mjs"
```

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/queries/settings.ts test/reminders.test.ts package.json
git commit -m "Add settings query module: generic key-value get/set"
```

---

### Task 2: `buildReminderSummary` — pure decision logic

**Files:**
- Create: `src/main/db/queries/reminders.ts`
- Test: `test/reminders.test.ts` (extend)

**Interfaces:**
- Consumes: `listTasks` (existing, from `src/main/db/queries/tasks.ts`), `habitsForDate`/`habitStats` (existing, from `src/main/db/queries/habits.ts`).
- Produces: `ReminderSummary { dueTaskCount: number; atRiskHabits: { id: number; name: string; streak: number }[] }`, `buildReminderSummary(date?: string, spaceId?: number | null): ReminderSummary` — consumed by Task 3.

- [ ] **Step 1: Extend the failing test**

Add to `test/reminders.test.ts`, alongside the existing imports:

```ts
const tasks = await import('../src/main/db/queries/tasks')
const habits = await import('../src/main/db/queries/habits')
const reminders = await import('../src/main/db/queries/reminders')
const { addDays, today } = await import('../src/shared/dates')
```

And these checks before the final `console.log`/`finally`:

```ts
  const academic = spaces.listSpaces()[0].id
  const day = today()

  check('an empty day has no due tasks and no at-risk habits', () => {
    const summary = reminders.buildReminderSummary(day)
    assert.equal(summary.dueTaskCount, 0)
    assert.deepEqual(summary.atRiskHabits, [])
  })

  check('an undone task due today counts toward dueTaskCount', () => {
    tasks.createTask({ spaceId: academic, title: 'Ship it', dueDate: day })
    const summary = reminders.buildReminderSummary(day)
    assert.equal(summary.dueTaskCount, 1)
  })

  check('a done task due today does not count', () => {
    const before = reminders.buildReminderSummary(day).dueTaskCount
    const t = tasks.createTask({ spaceId: academic, title: 'Already done', dueDate: day })
    tasks.toggleTask(t.id, day) // mark it done immediately, before the next check
    const after = reminders.buildReminderSummary(day).dueTaskCount
    assert.equal(after, before)
  })

  check('a habit streak below the threshold is not at-risk', () => {
    const habit = habits.createHabit({ spaceId: academic, name: 'Short streak' })
    habits.toggleHabit(habit.id, addDays(day, -1)) // 1-day streak, not done today
    const summary = reminders.buildReminderSummary(day)
    assert.ok(!summary.atRiskHabits.some((h) => h.id === habit.id))
  })

  check('a habit streak at or above the threshold, not done today, is at-risk', () => {
    const habit = habits.createHabit({ spaceId: academic, name: 'Long streak' })
    habits.toggleHabit(habit.id, addDays(day, -1))
    habits.toggleHabit(habit.id, addDays(day, -2))
    habits.toggleHabit(habit.id, addDays(day, -3)) // 3-day streak ending yesterday
    const summary = reminders.buildReminderSummary(day)
    const found = summary.atRiskHabits.find((h) => h.id === habit.id)
    assert.ok(found)
    assert.equal(found!.streak, 3)
  })

  check('a habit already done today is never at-risk, regardless of streak', () => {
    const habit = habits.createHabit({ spaceId: academic, name: 'Done already' })
    habits.toggleHabit(habit.id, addDays(day, -1))
    habits.toggleHabit(habit.id, addDays(day, -2))
    habits.toggleHabit(habit.id, day) // done today
    const summary = reminders.buildReminderSummary(day)
    assert.ok(!summary.atRiskHabits.some((h) => h.id === habit.id))
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx esbuild test/reminders.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/reminders.test.mjs`
Expected: FAIL — cannot find module `../src/main/db/queries/reminders`.

- [ ] **Step 3: Implement `src/main/db/queries/reminders.ts`**

```ts
import { today } from '../../../shared/dates'
import { listTasks } from './tasks'
import { habitsForDate, habitStats } from './habits'

// ponytail: fixed threshold, not a user setting — add a Settings control if
// 3 days turns out to be the wrong number for how this actually gets used.
const AT_RISK_STREAK_THRESHOLD = 3

export interface ReminderSummary {
  dueTaskCount: number
  atRiskHabits: { id: number; name: string; streak: number }[]
}

/**
 * What's worth a nudge today: undone tasks due today (or overdue — `listTasks`'s
 * `today` scope already includes those), and habits with an unbroken streak of
 * at least AT_RISK_STREAK_THRESHOLD days that haven't been checked off yet today.
 * `habitStats` already computes "streak as of yesterday" whenever today isn't
 * done yet, so no separate date math is needed here.
 */
export function buildReminderSummary(
  date?: string,
  spaceId?: number | null
): ReminderSummary {
  const day = date ?? today()

  const dueTaskCount = listTasks({ spaceId, scope: 'today', date: day }).filter(
    (t) => t.status !== 'done'
  ).length

  const atRiskHabits = habitsForDate(day, spaceId)
    .filter((h) => !h.done)
    .map((h) => ({ id: h.id, name: h.name, streak: habitStats(h.id, day).current_streak }))
    .filter((h) => h.streak >= AT_RISK_STREAK_THRESHOLD)

  return { dueTaskCount, atRiskHabits }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx esbuild test/reminders.test.ts --bundle --platform=node --format=esm --packages=external --out-extension:.js=.mjs --outdir=out/test && node out/test/reminders.test.mjs`
Expected: PASS, `9 checks passed`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all files pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/queries/reminders.ts test/reminders.test.ts
git commit -m "Add buildReminderSummary: pure due-task and at-risk-habit decision logic"
```

---

### Task 3: `src/main/reminders.ts` — the Notification glue

**Files:**
- Create: `src/main/reminders.ts`

**Interfaces:**
- Consumes: `buildReminderSummary` from Task 2, `getSetting`/`setSetting` from Task 1.
- Produces: `startReminders(onClick: () => void): () => void` (the return value stops the interval) — consumed by Task 4.

This file imports from `'electron'`, so — matching `capture.ts`/`backup.ts` — it has no automated test; it's verified by typecheck now and manually once Task 4 wires it into the running app.

- [ ] **Step 1: Implement `src/main/reminders.ts`**

```ts
import { Notification } from 'electron'
import { today } from '../shared/dates'
import { buildReminderSummary } from './db/queries/reminders'
import { getSetting, setSetting } from './db/queries/settings'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // hourly
const LAST_NOTIFIED_KEY = 'reminders.lastNotifiedDate'

function buildMessage(summary: ReturnType<typeof buildReminderSummary>): string | null {
  const parts: string[] = []
  if (summary.dueTaskCount > 0) {
    parts.push(`${summary.dueTaskCount} task${summary.dueTaskCount === 1 ? '' : 's'} due today`)
  }
  for (const h of summary.atRiskHabits) {
    parts.push(`${h.name} streak (${h.streak}d) needs today's check-in`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Fires at most once per calendar day — gated by a settings row, not by only
 * calling this once, since it's re-invoked hourly to catch a day that started
 * with nothing due yet (e.g. the app launched at midnight and a task's due
 * date is today).
 */
function checkAndNotify(onClick: () => void): void {
  if (!Notification.isSupported()) return
  const day = today()
  if (getSetting(LAST_NOTIFIED_KEY) === day) return

  const message = buildMessage(buildReminderSummary(day))
  if (!message) return

  const notification = new Notification({ title: 'Oryn', body: message })
  notification.on('click', onClick)
  notification.show()
  setSetting(LAST_NOTIFIED_KEY, day)
}

/**
 * Checks once immediately, then hourly. Returns a stop function so the
 * interval can be cleared on app quit.
 */
export function startReminders(onClick: () => void): () => void {
  checkAndNotify(onClick)
  const timer = setInterval(() => checkAndNotify(onClick), CHECK_INTERVAL_MS)
  return () => clearInterval(timer)
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/main/reminders.ts
git commit -m "Add the Notification glue: startReminders"
```

---

### Task 4: Wire reminders into the app lifecycle

**Files:**
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `startReminders` from Task 3, the existing `showMainWindow` function already defined in this file.

- [ ] **Step 1: Import and start it after the tray/window are set up**

In `src/main/index.ts`, add the import alongside the other local imports:

```ts
import { currentHotkey, registerCaptureIpc, registerHotkey, toggleCaptureWindow } from './capture'
import { startReminders } from './reminders'
```

Add a module-scope variable alongside the existing `let tray: Tray | null = null`:

```ts
/** Set once reminders start; cleared and called on quit to stop the hourly check. */
let stopReminders: (() => void) | null = null
```

Inside `app.whenReady().then(() => { ... })`, after `buildTray()` and before `createWindow()`:

```ts
    buildTray()
    stopReminders = startReminders(showMainWindow)

    createWindow()
```

- [ ] **Step 2: Stop the interval on quit**

Replace the existing `will-quit` handler:

```ts
  app.on('will-quit', () => {
    globalShortcutCleanup()
    closeDb()
  })
```

with:

```ts
  app.on('will-quit', () => {
    stopReminders?.()
    globalShortcutCleanup()
    closeDb()
  })
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Manual verification note**

This can't be driven from this shell (no real Electron display session available here — the same limitation noted for every other UI-facing task this phase). When next running the packaged or dev app on a real desktop session: create a task due today, wait for the next hourly check or restart the app, and confirm a Windows notification titled "Oryn" appears; clicking it should bring the main window to front.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "Start the daily reminder check on app launch"
```

---

### Task 5: Final full-suite check

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 2: No commit needed** — this task only verifies the tree left by Task 4 is green.
