# Future Work

Planned but not yet built. Each item is scoped to reuse existing patterns/schema
where possible — see "Reuses" per feature. Build order matters within a phase;
phases are independent of each other.

## Phase 4

Order: Search → Tags → Backlinks → Backup → Reminders (tags/backlinks touch
notes storage that search should index; backup/reminders are independent).

### 1. Global search

Extend the Cmd+K command palette (`CommandPalette.tsx`) to search notes, tasks,
habits, and journal — currently notes-only.

- **Backend:** new `search.ts` query module + `search:global` IPC channel
  returning `{ notes, tasks, habits, journal }`, ~5 results each.
  - Notes: reuse existing `searchNotes` (FTS5) as-is.
  - Tasks: `LIKE` on `title`/`description`, scoped by space (table is small,
    FTS not worth it).
  - Habits: `LIKE` on `name`, scoped by space.
  - Journal: `LIKE` on `content_text`. Not space-scoped — journal has no
    `space_id` column, so it always searches all entries.
- **Frontend:** palette renders one `cmdk` group per type (reuse
  `GROUP_HEADING` style). Selecting a task/habit result sets a new
  `focusTarget: { view, id } | null` on the zustand store and navigates; the
  target view reads it on mount, scrolls the item into view, briefly
  highlights it, then clears it. Journal results just jump to that date.
- **Reuses:** existing FTS5 pattern, `cmdk` groups, store navigation.
- **Test:** `test/search.test.ts` following the existing `test/*.test.ts` style.

### 2. Tags — done

Shared `#tag` system across notes and tasks. Tags are parsed from title +
body/description (not title alone — see the plan doc for why), synced via
`tags.ts`, and filterable through chip rows in Notes and Tasks. See
`docs/superpowers/plans/2026-09-11-tags.md`.

### 3. Backlinks — done

`[[Note Title]]` references, resolved by case-insensitive title match on
save (no BlockNote autocomplete — see the plan doc for why that got cut in
favor of the same plain-text-parse approach Tags uses). A "Linked mentions"
panel on the target note lists every note linking to it. See
`docs/superpowers/plans/2026-09-11-backlinks.md`.

### 4. Backup / export — already done

Turned out to already exist in `src/main/backup.ts`: `backupNow()` snapshots
the SQLite file (WAL checkpoint first, so nothing recent is lost), and
`exportMarkdown()` exports notes to Markdown files. Nothing left to build here.

### 5. Reminders

Native OS notification when a task is due or a habit streak is at risk.

- Electron's built-in `Notification` API — no new dependency.
- A main-process interval (checked once on launch + hourly, not a
  always-on scheduler) queries: tasks with `due_date = today` and not done,
  and habits with no entry yet today where yesterday's streak was ≥ some
  threshold.
- **Reuses:** existing task/habit query modules for the "what's due" logic.
- Skipped: configurable quiet hours, per-task custom reminder times, snooze —
  ship the blunt "due today" nudge first, refine if it's noisy in practice.

## Phase 5

Automation and insights, built on top of Phase 4. Mobile/companion access was
considered and dropped for this phase (real sync/hosting cost not justified
yet — local desktop app only).

### Automation

- **Recurring habit/checklist templates:** a `templates` table
  (`title`, `items_json`) you can "spawn" into a day as a batch of tasks —
  distinct from the existing single-task `recur_rule`, which already handles
  one-task recurrence and stays as-is.
- **Auto-carry-over of missed tasks:** on app launch, tasks with
  `due_date < today` and `status != 'done'` get their `due_date` bumped to
  today (only if they have no `recur_rule` — recurring tasks already spawn
  fresh copies and shouldn't also carry over). One query, runs where startup
  migrations already run.
- **Smart due-date suggestions:** when adding a task, suggest a due date by
  looking at the median gap between creation and completion for tasks with
  a similar title (simple `LIKE`-based lookup, no ML/embeddings) in the same
  space. Weakest of the three — ship last, cut if it doesn't feel useful.

### Insights

Builds on the existing `stats.ts`/`ActivityView` heatmap rather than
duplicating it.

- **Weekly/monthly review screen:** new `Review` view, reuses
  `stats.ts` history queries aggregated over a week/month instead of daily —
  tasks done vs. created, habit completion %, journal-entry count, busiest
  space.
- **Trend comparisons:** "this period vs. last period" deltas — same
  `historyFor()` queries called twice with two date ranges, diffed in the UI.
  No new backend concept.
- **Habit correlation stats:** for each pair of active habits, a simple
  same-day co-occurrence rate from `habit_entries` (no real statistics
  library — a plain correlation-coefficient calc in TS is enough at this
  data scale). Weakest/most speculative of the insights items — ship after
  the review screen and trends prove useful, cut if correlations turn out
  noisy with typical entry counts.

## Phase 6

App lock, attachments, and multi-window/focus modes. No build-order
dependency between the three; app lock is the smallest, do it first.

### App lock

PIN/passcode gate on launch and after idle. Not full at-rest encryption — the
SQLite file stays plain, this is a UI-level lock so a casual look at the app
doesn't expose the journal.

- **Storage:** PIN hash (not plaintext) in the existing `settings`
  key-value table — no new table needed.
- **Gate:** a lock screen component rendered before the shell mounts if a PIN
  is set; unlocks the render, doesn't protect the file on disk.
- **Idle re-lock:** reuse the existing window-focus/activity events already
  wired in `index.ts` for tray/window handling; re-show the lock screen after
  N idle minutes (configurable in Settings, default e.g. 10).
- Skipped: full DB encryption (SQLCipher) — that's a real driver swap
  (`better-sqlite3` → a SQLCipher-compatible build) for a desktop app that's
  already local-only; revisit only if the threat model changes (e.g. cloud
  sync lands and the file leaves the machine).

### Attachments

Images in notes, files on tasks, voice notes — same underlying storage.

- **Storage:** one `attachments` table (`id`, `kind`, `owner_type`,
  `owner_id`, `filename`, `created_at`) plus files on disk under
  `userData/attachments/<id>-<filename>` — mirrors how `backup.ts` already
  uses `app.getPath('userData')`, no new storage concept.
- **Images in notes:** BlockNote's default schema already has an image block;
  it just needs an `uploadFile` handler wired into `useCreateBlockNote` that
  saves the dropped/pasted file and returns a local URL (a custom
  `oryn-file://` protocol registered in the main process, since `file://`
  paths get finicky with Electron's security settings).
- **Files on tasks:** small attachment-chip list under a task's description,
  same table filtered by `owner_type = 'task'`. Add/remove via native
  `dialog.showOpenDialog`.
- **Voice notes:** record via the renderer's `MediaRecorder` (native browser
  API, no dependency), save the resulting blob through the same attachments
  IPC as files, `kind = 'audio'`. Playback is a plain `<audio>` element.
- Skipped: attachment size limits/compression, cloud storage — everything
  lives in `userData`, same trust boundary as the SQLite file already sits in.

### Multi-window / focus modes

- **Pop-out note window:** reuses the exact `capture.ts` pattern — a second
  `BrowserWindow` loading the renderer with a `?note=<id>` query param instead
  of the main shell. No new windowing code, just a second entry route.
- **Distraction-free writing mode:** in-app only, no new window — a store
  flag that hides the sidebar/topbar and expands `Editor` to fill the screen.
  Toggled from the note view, Escape exits.
- **Always-on-top mini Pomodoro:** small `BrowserWindow` with
  `alwaysOnTop: true` and no frame, showing just the existing `Pomodoro`
  component's countdown; the two windows (main + mini) share timer state via
  the same IPC broadcast pattern `capture.ts` already uses
  (`captures:changed` → here `pomodoro:tick`).
- Skipped: arbitrary multi-note tiling/workspaces — three purpose-built
  windows cover the actual asks; a general window-manager is speculative
  until one of these three isn't enough on its own.
