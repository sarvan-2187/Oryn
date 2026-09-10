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

export type Priority = 'low' | 'med' | 'high'
export type TaskStatus = 'todo' | 'doing' | 'done'
export type RecurRule = 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface Task {
  id: number
  space_id: number
  parent_id: number | null
  title: string
  description: string
  due_date: string | null
  priority: Priority
  status: TaskStatus
  recur_rule: RecurRule | null
  sort_order: number
  completed_at: string | null
  created_at: string
  updated_at: string
}

/** A top-level task with its subtasks attached. */
export interface TaskTree extends Task {
  children: Task[]
}

export interface TaskPatch {
  title?: string
  description?: string
  dueDate?: string | null
  priority?: Priority
  status?: TaskStatus
  recurRule?: RecurRule | null
  spaceId?: number
  sortOrder?: number
}

export type HabitKind = 'bool' | 'count'

export interface Habit {
  id: number
  space_id: number
  name: string
  kind: HabitKind
  target: number
  unit: string
  color: string
  is_active: number
  sort_order: number
}

/** A habit joined with one day's entry, for the dashboard check-in row. */
export interface HabitToday extends Habit {
  value: number
  done: boolean
}

export interface HabitStats {
  current_streak: number
  longest_streak: number
  days_done: number
}

export interface JournalEntry {
  id: number
  date: string
  content_json: string
  content_text: string
}
