import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'

const invoke =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args)

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
  search: {
    global: invoke('search:global')
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
  stats: {
    activity: invoke('stats:activity')
  },
  deadlines: {
    list: invoke('deadlines:list'),
    create: invoke('deadlines:create'),
    update: invoke('deadlines:update'),
    delete: invoke('deadlines:delete')
  },
  classes: {
    list: invoke('classes:list'),
    create: invoke('classes:create'),
    delete: invoke('classes:delete')
  },
  focus: {
    log: invoke('focus:log'),
    minutes: invoke('focus:minutes')
  },
  captures: {
    list: invoke('captures:list'),
    count: invoke('captures:count'),
    delete: invoke('captures:delete'),
    convert: invoke('captures:convert'),
    /** Fires when a capture is saved from the popup, so the inbox can refresh. */
    onChanged: (cb: () => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('captures:changed', handler)
      return () => ipcRenderer.removeListener('captures:changed', handler)
    }
  },
  capture: {
    save: invoke('capture:save'),
    close: invoke('capture:close'),
    setHotkey: invoke('capture:setHotkey'),
    getHotkey: invoke('capture:getHotkey'),
    onOpened: (cb: () => void) => {
      const handler = (_e: IpcRendererEvent): void => cb()
      ipcRenderer.on('capture:opened', handler)
      return () => ipcRenderer.removeListener('capture:opened', handler)
    }
  },
  data: {
    path: invoke('data:path'),
    backup: invoke('data:backup'),
    export: invoke('data:export'),
    reveal: invoke('data:reveal')
  },
  window: {
    setTheme: invoke('window:theme'),
    /** Scales the entire UI, editor and all, rather than any one font rule. */
    setZoom: (factor: number) => webFrame.setZoomFactor(factor)
  }
}

contextBridge.exposeInMainWorld('oryn', api)
