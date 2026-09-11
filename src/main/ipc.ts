import { ipcMain } from 'electron'
import * as spaces from './db/queries/spaces'
import * as notes from './db/queries/notes'
import * as tasks from './db/queries/tasks'
import * as habits from './db/queries/habits'
import * as journal from './db/queries/journal'
import * as search from './db/queries/search'
import * as tags from './db/queries/tags'
import * as stats from './db/queries/stats'
import * as planner from './db/queries/planner'
import { backupNow, exportMarkdown, revealPath } from './backup'
import { dbPath } from './db/connection'

/**
 * Every renderer-callable function lives in this map. The preload script mirrors
 * its keys, so adding a feature means adding one entry here and one line there.
 */
const handlers = {
  'spaces:list': spaces.listSpaces,
  'spaces:create': spaces.createSpace,
  'spaces:update': spaces.updateSpace,
  'spaces:delete': spaces.deleteSpace,

  'notes:list': notes.listNotes,
  'notes:get': notes.getNote,
  'notes:create': notes.createNote,
  'notes:update': notes.updateNote,
  'notes:archive': notes.archiveNote,
  'notes:delete': notes.deleteNote,
  'notes:search': notes.searchNotes,

  'search:global': search.globalSearch,

  'tags:list': tags.listTags,

  'tasks:list': tasks.listTasks,
  'tasks:create': tasks.createTask,
  'tasks:update': tasks.updateTask,
  'tasks:toggle': tasks.toggleTask,
  'tasks:delete': tasks.deleteTask,
  'tasks:counts': tasks.taskCounts,

  'habits:list': habits.listHabits,
  'habits:forDate': habits.habitsForDate,
  'habits:create': habits.createHabit,
  'habits:update': habits.updateHabit,
  'habits:delete': habits.deleteHabit,
  'habits:setValue': habits.setHabitValue,
  'habits:toggle': habits.toggleHabit,
  'habits:stats': habits.habitStats,
  'habits:history': habits.habitHistory,

  'journal:get': journal.getJournal,
  'journal:save': journal.saveJournal,

  'stats:activity': stats.activity,

  'deadlines:list': planner.listDeadlines,
  'deadlines:create': planner.createDeadline,
  'deadlines:update': planner.updateDeadline,
  'deadlines:delete': planner.deleteDeadline,

  'classes:list': planner.listClasses,
  'classes:create': planner.createClass,
  'classes:delete': planner.deleteClass,

  'focus:log': planner.logFocus,
  'focus:minutes': planner.focusMinutes,

  'captures:list': planner.listCaptures,
  'captures:count': planner.captureCount,
  'captures:delete': planner.deleteCapture,
  'captures:convert': planner.convertCapture,

  'data:path': dbPath,
  'data:backup': backupNow,
  'data:export': exportMarkdown,
  'data:reveal': revealPath
} as const

export type Handlers = typeof handlers

export function registerIpc(): void {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) =>
      (fn as (...a: unknown[]) => unknown)(...args)
    )
  }
}
