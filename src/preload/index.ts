import { contextBridge, ipcRenderer } from 'electron'

const invoke = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

/** Mirrors the handler map in src/main/ipc.ts. Keep the two in step. */
const api = {
  spaces: {
    list: invoke('spaces:list'),
    create: invoke('spaces:create'),
    update: invoke('spaces:update'),
    delete: invoke('spaces:delete')
  },
  notes: {
    list: invoke('notes:list'),
    get: invoke('notes:get'),
    create: invoke('notes:create'),
    update: invoke('notes:update'),
    archive: invoke('notes:archive'),
    delete: invoke('notes:delete'),
    search: invoke('notes:search')
  }
}

contextBridge.exposeInMainWorld('oryn', api)
