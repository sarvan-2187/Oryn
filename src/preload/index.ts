import { contextBridge, ipcRenderer, webFrame } from 'electron'

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
  },
  tasks: {
    list: invoke('tasks:list'),
    create: invoke('tasks:create'),
    update: invoke('tasks:update'),
    toggle: invoke('tasks:toggle'),
    delete: invoke('tasks:delete'),
    counts: invoke('tasks:counts')
  },
  habits: {
    list: invoke('habits:list'),
    forDate: invoke('habits:forDate'),
    create: invoke('habits:create'),
    update: invoke('habits:update'),
    delete: invoke('habits:delete'),
    setValue: invoke('habits:setValue'),
    toggle: invoke('habits:toggle'),
    stats: invoke('habits:stats'),
    history: invoke('habits:history')
  },
  journal: {
    get: invoke('journal:get'),
    save: invoke('journal:save')
  },
  window: {
    setTheme: invoke('window:theme'),
    /** Scales the entire UI, editor and all, rather than any one font rule. */
    setZoom: (factor: number) => webFrame.setZoomFactor(factor)
  }
}

contextBridge.exposeInMainWorld('oryn', api)
