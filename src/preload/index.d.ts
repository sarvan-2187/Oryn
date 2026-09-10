import type { Space, Note, NoteSummary, NotePatch } from '../shared/types'

export interface OrynApi {
  spaces: {
    list(): Promise<Space[]>
    create(input: { name: string; icon?: string; color?: string }): Promise<Space>
    update(id: number, patch: Partial<Pick<Space, 'name' | 'icon' | 'color'>>): Promise<void>
    delete(id: number): Promise<void>
  }
  notes: {
    list(opts?: { spaceId?: number | null; archived?: boolean }): Promise<NoteSummary[]>
    get(id: number): Promise<Note | undefined>
    create(input: { spaceId: number; title?: string }): Promise<Note>
    update(id: number, patch: NotePatch): Promise<void>
    archive(id: number, archived?: boolean): Promise<void>
    delete(id: number): Promise<void>
    search(query: string, spaceId?: number | null): Promise<NoteSummary[]>
  }
}

declare global {
  interface Window {
    oryn: OrynApi
  }
}
