import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { migrations, seedSql } from './migrations'

let db: Database.Database | null = null

/**
 * Where the database lives. ORYN_DB_PATH wins, which lets the data layer run
 * outside Electron (tests, scripts). Electron is required lazily for the same
 * reason: importing this module must not require an Electron runtime.
 */
export function dbPath(): string {
  const override = process.env.ORYN_DB_PATH
  if (override) return override
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')
  return join(app.getPath('userData'), 'oryn.db')
}

/**
 * Opens the database, applies any unapplied migrations and seeds first-run data.
 * Migration index is tracked in PRAGMA user_version; each step runs in its own
 * transaction so a failure leaves the previous version intact.
 */
export function getDb(): Database.Database {
  if (db) return db

  const file = dbPath()
  mkdirSync(dirname(file), { recursive: true })
  const isNew = !existsSync(file)

  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')

  const applied = db.pragma('user_version', { simple: true }) as number
  for (let i = applied; i < migrations.length; i++) {
    const sql = migrations[i]
    db.transaction(() => {
      db!.exec(sql)
      db!.pragma(`user_version = ${i + 1}`)
    })()
  }

  if (isNew) db.exec(seedSql)
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
