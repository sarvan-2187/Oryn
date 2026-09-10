/** Row shapes shared by the main process and the renderer. No runtime code here. */

export interface Space {
  id: number
  name: string
  icon: string
  color: string
  sort_order: number
  is_system: number
}

export interface Note {
  id: number
  space_id: number
  title: string
  content_json: string
  content_text: string
  is_pinned: number
  archived_at: string | null
  created_at: string
  updated_at: string
}

/** List rows omit content to keep the payload small. */
export type NoteSummary = Omit<Note, 'content_json' | 'content_text'> & { excerpt: string }

export interface NotePatch {
  title?: string
  contentJson?: string
  contentText?: string
  spaceId?: number
  isPinned?: boolean
}
