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

### 2. Tags

Shared `#tag` system across notes and tasks, filterable app-wide.

- **Schema:** `tags (id, name UNIQUE)` + join tables `note_tags` and
  `task_tags` (id pairs, `ON DELETE CASCADE`) — standard many-to-many, no new
  pattern needed.
- **Capture:** parse `#tag` tokens out of note titles/task titles on
  save (regex, no editor plugin) and sync the join table to match.
- **Browse:** a tag shows up as a filter chip alongside the existing space
  filter in Notes/Tasks views; clicking filters the list via a `tagId` query
  param on the existing list queries.
- **Reuses:** existing space-filter UI pattern, existing list query shape
  (just add an optional `tagId` param like the existing `spaceId` one).
- Skipped: nested/hierarchical tags, tag colors, autocomplete UI — add if flat
  tags turn out to not be enough.

### 3. Backlinks

`[[note title]]` references inside a note, with a "linked mentions" panel.

- **Schema:** `note_links (source_id, target_id)` derived table, rebuilt from
  parsed content on note save (not hand-maintained) — same
  derive-don't-store philosophy as `stats.ts` uses for activity.
- **Editor:** BlockNote supports custom inline content — add a `[[` trigger
  that opens an autocomplete of note titles (reuse the search backend from
  item 1) and inserts a link node.
- **Panel:** below the editor, a collapsible "Linked mentions" list queries
  `note_links WHERE target_id = ?`.
- **Reuses:** note search for the autocomplete, existing note IPC patterns.

### 4. Backup / export

"Backup now" button in Settings.

- Copies the live SQLite file (via `VACUUM INTO` for a consistent snapshot,
  not a raw file copy) plus a JSON export of all tables to a folder picked
  via Electron's native `dialog.showSaveDialog` — no custom file picker UI.
- **Reuses:** `settings` key-value table to remember the last chosen folder.
- Skipped: cloud sync, scheduled/automatic backups, incremental backups — this
  is a manual local safety net; automatic scheduling can be added later if
  manual backup proves to not happen often enough in practice.

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
