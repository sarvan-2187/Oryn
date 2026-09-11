/**
 * Ordered migrations. Never edit or reorder an existing entry once it has run on
 * a real database; append a new one instead. Applied index is tracked in
 * `PRAGMA user_version`, so no migration library is needed.
 */
export const migrations: string[] = [
  // 001 - initial schema
  `
  CREATE TABLE spaces (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    icon       TEXT    NOT NULL DEFAULT 'circle',
    color      TEXT    NOT NULL DEFAULT '#6366f1',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_system  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE notes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id     INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL DEFAULT '',
    content_json TEXT    NOT NULL DEFAULT '[]',
    content_text TEXT    NOT NULL DEFAULT '',
    is_pinned    INTEGER NOT NULL DEFAULT 0,
    archived_at  TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_notes_space   ON notes(space_id, archived_at, updated_at DESC);
  CREATE INDEX idx_notes_created ON notes(created_at);

  -- External-content FTS index over notes, kept in sync by triggers below.
  CREATE VIRTUAL TABLE notes_fts USING fts5(
    title, content_text, content='notes', content_rowid='id', tokenize='porter unicode61'
  );
  CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content_text)
      VALUES (new.id, new.title, new.content_text);
  END;
  CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content_text)
      VALUES ('delete', old.id, old.title, old.content_text);
  END;
  CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content_text)
      VALUES ('delete', old.id, old.title, old.content_text);
    INSERT INTO notes_fts(rowid, title, content_text)
      VALUES (new.id, new.title, new.content_text);
  END;

  CREATE TABLE tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id     INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    parent_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    due_date     TEXT,
    priority     TEXT    NOT NULL DEFAULT 'med' CHECK (priority IN ('low','med','high')),
    status       TEXT    NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
    recur_rule   TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_tasks_due    ON tasks(due_date, status);
  CREATE INDEX idx_tasks_space  ON tasks(space_id, status);
  CREATE INDEX idx_tasks_parent ON tasks(parent_id);
  CREATE INDEX idx_tasks_done   ON tasks(completed_at);

  CREATE TABLE habits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id   INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    kind       TEXT    NOT NULL DEFAULT 'bool' CHECK (kind IN ('bool','count')),
    target     REAL    NOT NULL DEFAULT 1,
    unit       TEXT    NOT NULL DEFAULT '',
    color      TEXT    NOT NULL DEFAULT '#22c55e',
    is_active  INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE habit_entries (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date     TEXT    NOT NULL,
    value    REAL    NOT NULL DEFAULT 1,
    UNIQUE (habit_id, date)
  );
  CREATE INDEX idx_habit_entries_date ON habit_entries(date);

  CREATE TABLE journal (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT    NOT NULL UNIQUE,
    content_json TEXT    NOT NULL DEFAULT '[]',
    content_text TEXT    NOT NULL DEFAULT '',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE deadlines (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id   INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    date       TEXT    NOT NULL,
    kind       TEXT    NOT NULL DEFAULT 'exam' CHECK (kind IN ('exam','submission','hackathon')),
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_deadlines_date ON deadlines(date);

  CREATE TABLE timetable (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id    INTEGER REFERENCES spaces(id) ON DELETE SET NULL,
    subject     TEXT    NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time  TEXT    NOT NULL,
    end_time    TEXT    NOT NULL,
    location    TEXT    NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_timetable_day ON timetable(day_of_week, start_time);

  CREATE TABLE focus_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    started_at TEXT    NOT NULL,
    date       TEXT    NOT NULL,
    minutes    INTEGER NOT NULL
  );
  CREATE INDEX idx_focus_date ON focus_sessions(date);

  CREATE TABLE captures (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    text         TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 002 - tags
  `
  CREATE TABLE tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE note_tags (
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
  );
  CREATE INDEX idx_note_tags_tag ON note_tags(tag_id);

  CREATE TABLE task_tags (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
  );
  CREATE INDEX idx_task_tags_tag ON task_tags(tag_id);
  `
]

/** Seeded on first run only. Inbox is the system space quick-capture writes into. */
export const seedSql = `
  INSERT INTO spaces (name, icon, color, sort_order, is_system) VALUES
    ('Academic',   'graduation-cap', '#3b82f6', 1, 0),
    ('Research',   'flask',          '#a855f7', 2, 0),
    ('Hackathons', 'rocket',         '#f59e0b', 3, 0),
    ('Personal',   'user',           '#22c55e', 4, 0),
    ('Inbox',      'inbox',          '#64748b', 99, 1);
`
