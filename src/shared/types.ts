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

export type ActivityMetric =
  | { kind: 'all' }
  | { kind: 'tasks' }
  | { kind: 'notes' }
  | { kind: 'focus' }
  | { kind: 'habit'; habitId: number }
  | { kind: 'space'; spaceId: number }

export interface ActivityResult {
  from: string
  to: string
  /** Date to value; days with no activity are absent rather than zero. */
  history: Record<string, number>
  total: number
  active_days: number
  current_streak: number
  longest_streak: number
  best_day: string | null
  best_value: number
}

export type DeadlineKind = 'exam' | 'submission' | 'hackathon'

export interface Deadline {
  id: number
  space_id: number
  title: string
  date: string
  kind: DeadlineKind
}

export interface ClassSlot {
  id: number
  space_id: number | null
  subject: string
  day_of_week: number
  start_time: string
  end_time: string
  location: string
}

export interface FocusSession {
  id: number
  task_id: number | null
  started_at: string
  date: string
  minutes: number
}

export interface Capture {
  id: number
  text: string
  created_at: string
  processed_at: string | null
}

export interface TaskSearchResult {
  id: number
  title: string
  status: TaskStatus
  due_date: string | null
}

export interface HabitSearchResult {
  id: number
  name: string
}

export interface JournalSearchResult {
  date: string
  excerpt: string
}

export interface GlobalSearchResult {
  notes: NoteSummary[]
  tasks: TaskSearchResult[]
  habits: HabitSearchResult[]
  journal: JournalSearchResult[]
}

export interface Tag {
  id: number
  name: string
}

export interface Template {
  id: number
  title: string
  items: string[]
  created_at: string
}
