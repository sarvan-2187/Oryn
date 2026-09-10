import { ipcMain } from 'electron'
import * as spaces from './db/queries/spaces'
import * as notes from './db/queries/notes'

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
  'notes:search': notes.searchNotes
} as const

export type Handlers = typeof handlers

export function registerIpc(): void {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) =>
      (fn as (...a: unknown[]) => unknown)(...args)
    )
  }
}
