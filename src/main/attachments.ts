import { dialog, shell, BrowserWindow } from 'electron'
import { addFileAttachment, attachmentPath } from './db/queries/attachments'
import type { Attachment } from '../shared/types'

/** Opens a native file picker; returns null if the user cancels. */
export async function pickAndAttachFile(
  ownerType: 'note' | 'task',
  ownerId: number
): Promise<Attachment | null> {
  const win = BrowserWindow.getFocusedWindow() ?? undefined
  const result = win
    ? await dialog.showOpenDialog(win, { properties: ['openFile'] })
    : await dialog.showOpenDialog({ properties: ['openFile'] })
  if (result.canceled || result.filePaths.length === 0) return null
  return addFileAttachment(ownerType, ownerId, result.filePaths[0])
}

/** Opens an attachment's file with whatever the OS has associated with it. */
export function openAttachment(id: number): void {
  const path = attachmentPath(id)
  if (path) void shell.openPath(path)
}
