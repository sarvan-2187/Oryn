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

### Attachments — done

Files on tasks use one `attachments` table + `userData/attachments/`. Images
skip that table entirely — the original custom `oryn-file://` protocol idea
was dropped in favor of BlockNote's `uploadFile` just returning a `data:`
URL, no protocol/IPC needed at all. Voice notes shipped on the same table
but were later removed at the user's request. See
`docs/superpowers/plans/2026-09-11-attachments.md`.

### Multi-window / focus modes — done

Pop-out note window (`?note=<id>` into the main renderer bundle), a
distraction-free focus mode (store flag, Escape exits), and an always-on-top
mini Pomodoro. The Pomodoro timer itself moved into the main process as the
single source of truth — the original note assumed the existing
`Pomodoro.tsx` had shareable state to broadcast; it didn't (it was a local
per-component timer), so two independent instances would have drifted apart.
See `docs/superpowers/plans/2026-09-11-multi-window.md`.

**Phase 6 complete.**
