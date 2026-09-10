import type {
  Space,
  Note,
  NoteSummary,
  NotePatch,
  Task,
  TaskTree,
  TaskPatch,
  Priority,
  RecurRule,
  Habit,
  HabitToday,
  HabitStats,
  HabitKind,
  JournalEntry
} from '../shared/types'

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
  tasks: {
    list(opts?: {
      spaceId?: number | null
      scope?: 'today' | 'upcoming' | 'all' | 'someday'
      date?: string
    }): Promise<TaskTree[]>
    create(input: {
      spaceId: number
      title: string
      dueDate?: string | null
      priority?: Priority
      parentId?: number | null
      recurRule?: RecurRule | null
    }): Promise<Task>
    update(id: number, patch: TaskPatch): Promise<void>
    toggle(id: number, date?: string): Promise<Task | undefined>
    delete(id: number): Promise<void>
    counts(date?: string, spaceId?: number | null): Promise<{ due: number; overdue: number; done: number }>
  }
  habits: {
    list(spaceId?: number | null): Promise<Habit[]>
    forDate(date?: string, spaceId?: number | null): Promise<HabitToday[]>
    create(input: {
      spaceId: number
      name: string
      kind?: HabitKind
      target?: number
      unit?: string
      color?: string
    }): Promise<Habit>
    update(id: number, patch: Partial<Habit>): Promise<void>
    delete(id: number): Promise<void>
    setValue(habitId: number, date: string, value: number): Promise<void>
    toggle(habitId: number, date: string): Promise<void>
    stats(habitId: number, date?: string): Promise<HabitStats>
    history(habitId: number, from: string, to: string): Promise<Record<string, number>>
  }
  journal: {
    get(date?: string): Promise<JournalEntry>
    save(date: string, contentJson: string, contentText: string): Promise<void>
  }
  window: {
    /** Repaints the native min/max/close buttons to match the app theme. */
    setTheme(theme: 'dark' | 'light'): Promise<void>
    /** Scales the whole interface. 1 is 100%. */
    setZoom(factor: number): void
  }
}

declare global {
  interface Window {
    oryn: OrynApi
  }
}
