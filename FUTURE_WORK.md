# Future Work

Planned but not yet built. Each item is scoped to reuse existing patterns/schema
where possible — see "Reuses" per feature. Build order matters within a phase;
phases are independent of each other.

## Phase 4

Order: Search → Tags → Backlinks → Backup → Reminders (tags/backlinks touch
notes storage that search should index; backup/reminders are independent).

### 1. Global search — done

Cmd+K now searches notes, tasks, habits, and journal (grouped, via a new
`search:global` IPC channel), scoped to the active space except journal
(no `space_id` column). Selecting a task/habit result scrolls to and
highlights it in its view. See
`docs/superpowers/plans/2026-09-11-global-search.md`.

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

### 5. Reminders — done

A native OS notification fires once per calendar day (gated via a new
`settings` key-value module — the original one-liner didn't say what stops
an hourly check from renotifying every hour, so that gate was added) when
there are tasks due today or a habit streak (≥3 days) is unchecked. See
`docs/superpowers/plans/2026-09-11-reminders.md`.

**Phase 4 complete.**

## Phase 5

Automation and insights, built on top of Phase 4. Mobile/companion access was
considered and dropped for this phase (real sync/hosting cost not justified
yet — local desktop app only).

### Automation — done

Checklist templates (spawn a batch of tasks into today from Settings),
auto-carry-over of missed non-recurring tasks on launch, and a dismissible
due-date suggestion hint based on past completion gaps for similar titles.
See `docs/superpowers/plans/2026-09-11-automation.md`.

### Insights — done

A Review screen (week/month toggle) showing tasks done vs. created, habit
completion %, journal entries, and busiest space, each compared against the
prior period. Plus a short, noise-filtered list of habit pairs that
correlate (Pearson, `|r| ≥ 0.3`, top 5). See
`docs/superpowers/plans/2026-09-11-insights.md`.

**Phase 5 complete.**

## Phase 6

App lock, attachments, and multi-window/focus modes. No build-order
dependency between the three; app lock is the smallest, do it first.

### App lock — done

A PIN gate: locks on launch if a PIN is set (`lock.ts`, scrypt-hashed via
Node's built-in `crypto`, stored in `settings`), and re-locks after an
idle timeout configurable in Settings. Idle re-lock is done via renderer
event listeners, not main-process activity events as the original note
assumed (none existed) — see the plan doc. Not full at-rest encryption,
by design. See `docs/superpowers/plans/2026-09-11-app-lock.md`.

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
