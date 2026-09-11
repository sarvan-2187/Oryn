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
  JournalEntry,
  ActivityMetric,
  ActivityResult,
  Deadline,
  DeadlineKind,
  ClassSlot,
  Capture,
  GlobalSearchResult,
  Tag,
  Template,
  ReviewSummary,
  HabitCorrelation,
  Attachment
} from '../shared/types'

export interface OrynApi {
  spaces: {
    list(): Promise<Space[]>
    create(input: { name: string; icon?: string; color?: string }): Promise<Space>
    update(id: number, patch: Partial<Pick<Space, 'name' | 'icon' | 'color'>>): Promise<void>
    delete(id: number): Promise<void>
  }
  notes: {
    list(opts?: {
      spaceId?: number | null
      archived?: boolean
      tagId?: number | null
    }): Promise<NoteSummary[]>
    get(id: number): Promise<Note | undefined>
    create(input: { spaceId: number; title?: string }): Promise<Note>
    update(id: number, patch: NotePatch): Promise<void>
    archive(id: number, archived?: boolean): Promise<void>
    delete(id: number): Promise<void>
    search(query: string, spaceId?: number | null): Promise<NoteSummary[]>
    backlinks(noteId: number): Promise<NoteSummary[]>
  }
  search: {
    global(query: string, spaceId?: number | null): Promise<GlobalSearchResult>
  }
  tags: {
    list(): Promise<Tag[]>
  }
  templates: {
    list(): Promise<Template[]>
    create(title: string, items: string[]): Promise<Template>
    delete(id: number): Promise<void>
    spawn(id: number, spaceId: number, date?: string): Promise<Task[]>
  }
  tasks: {
    list(opts?: {
      spaceId?: number | null
      scope?: 'today' | 'upcoming' | 'all' | 'someday'
      date?: string
      tagId?: number | null
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
    counts(
      date?: string,
      spaceId?: number | null
    ): Promise<{ due: number; overdue: number; done: number }>
    suggestDueDate(spaceId: number, title: string): Promise<string | null>
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
  stats: {
    activity(metric: ActivityMetric, opts?: { days?: number; to?: string }): Promise<ActivityResult>
  }
  insights: {
    review(from: string, to: string, spaceId?: number | null): Promise<ReviewSummary>
    correlations(from: string, to: string, spaceId?: number | null): Promise<HabitCorrelation[]>
  }
  lock: {
    isSet(): Promise<boolean>
    setPin(pin: string): Promise<void>
    clear(): Promise<void>
    verify(pin: string): Promise<boolean>
    getIdleMinutes(): Promise<number>
    setIdleMinutes(n: number): Promise<void>
  }
  attachments: {
    list(ownerType: 'note' | 'task', ownerId: number): Promise<Attachment[]>
    addFile(ownerType: 'note' | 'task', ownerId: number): Promise<Attachment | null>
    open(id: number): Promise<void>
    delete(id: number): Promise<void>
  }
  deadlines: {
    list(opts?: { spaceId?: number | null; includePast?: boolean }): Promise<Deadline[]>
    create(input: {
      spaceId: number
      title: string
      date: string
      kind?: DeadlineKind
    }): Promise<Deadline>
    update(id: number, patch: Partial<Deadline>): Promise<void>
    delete(id: number): Promise<void>
  }
  classes: {
    list(dayOfWeek?: number): Promise<ClassSlot[]>
    create(input: {
      subject: string
      dayOfWeek: number
      startTime: string
      endTime: string
      location?: string
      spaceId?: number | null
    }): Promise<ClassSlot>
    delete(id: number): Promise<void>
  }
  focus: {
    log(minutes: number, taskId?: number | null, date?: string): Promise<void>
    minutes(date?: string): Promise<number>
  }
  captures: {
    list(): Promise<Capture[]>
    count(): Promise<number>
    delete(id: number): Promise<void>
    convert(
      id: number,
      target: 'note' | 'task',
      spaceId: number
    ): Promise<{ kind: 'note' | 'task'; id: number } | undefined>
    /** Returns an unsubscribe function. */
    onChanged(cb: () => void): () => void
  }
  capture: {
    save(text: string): Promise<Capture | undefined>
    close(): Promise<void>
    /** Resolves false when the OS refuses the accelerator. */
    setHotkey(accelerator: string): Promise<boolean>
    getHotkey(): Promise<string>
    onOpened(cb: () => void): () => void
  }
  data: {
    path(): Promise<string>
    backup(): Promise<{ path: string }>
    export(): Promise<{ path: string; files: number } | null>
    reveal(target: string): Promise<void>
  }
  window: {
    /** Repaints the native min/max/close buttons to match the app theme. */
    setTheme(theme: 'dark' | 'light'): Promise<void>
    /** Scales the whole interface. 1 is 100%. */
    setZoom(factor: number): void
    popOutNote(noteId: number): Promise<void>
  }
}

declare global {
  interface Window {
    oryn: OrynApi
  }
}
