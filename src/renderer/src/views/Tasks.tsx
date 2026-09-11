import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { TaskRow, PRIORITY_OPTIONS, RECUR_OPTIONS, NO_RECUR } from '../components/TaskRow'
import { SimpleSelect } from '../components/ui/simple-select'
import { today } from '../../../shared/dates'
import type { TaskTree, Priority, RecurRule, Tag } from '../../../shared/types'

type Scope = 'today' | 'upcoming' | 'someday' | 'all'

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'someday', label: 'No date' },
  { id: 'all', label: 'All' }
]

export function TasksView(): React.JSX.Element {
  const { activeSpaceId, spaces, focusTaskId, setFocusTaskId } = useStore()
  const [scope, setScope] = useState<Scope>('today')
  const [tasks, setTasks] = useState<TaskTree[]>([])
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [tagId, setTagId] = useState<number | null>(null)

  const [title, setTitle] = useState('')
  const [due, setDue] = useState(today())
  const [dueTouched, setDueTouched] = useState(false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [priority, setPriority] = useState<Priority>('med')
  const [recur, setRecur] = useState<RecurRule | typeof NO_RECUR>(NO_RECUR)

  // Only offers a suggestion while the due date still holds its untouched
  // default — the field always has a value (it defaults to today), so
  // "untouched" has to be tracked explicitly rather than read off emptiness.
  useEffect(() => {
    if (!title.trim() || dueTouched) {
      setSuggestion(null)
      return
    }
    const target = activeSpaceId ?? spaces.find((s) => !s.is_system)?.id
    if (target == null) return
    const t = setTimeout(() => {
      void window.oryn.tasks.suggestDueDate(target, title).then((s) => {
        setSuggestion(s && s !== due ? s : null)
      })
    }, 400)
    return () => clearTimeout(t)
  }, [title, dueTouched, due, activeSpaceId, spaces])

  useEffect(() => {
    void window.oryn.tags.list().then(setTags)
  }, [])

  const refresh = useCallback(async () => {
    setTasks(await window.oryn.tasks.list({ spaceId: activeSpaceId, scope, tagId }))
  }, [activeSpaceId, scope, tagId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A search result can point at a task outside the current scope (e.g. an
  // "upcoming" task while viewing "Today"), so force the scope wide enough
  // to guarantee it's actually in the list before trying to scroll to it.
  useEffect(() => {
    if (focusTaskId != null) setScope('all')
  }, [focusTaskId])

  useEffect(() => {
    if (focusTaskId == null) return
    const el = document.getElementById(`task-${focusTaskId}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setHighlightId(focusTaskId)
    setFocusTaskId(null)
    const t = setTimeout(() => setHighlightId(null), 1500)
    return () => clearTimeout(t)
  }, [tasks, focusTaskId, setFocusTaskId])

  const add = async (): Promise<void> => {
    const text = title.trim()
    if (!text) return
    // "All spaces" has no home for a new task, so it lands in the first real space.
    const target = activeSpaceId ?? spaces.find((s) => !s.is_system)?.id
    if (target == null) return
    await window.oryn.tasks.create({
      spaceId: target,
      title: text,
      dueDate: scope === 'someday' ? null : due || null,
      priority,
      recurRule: recur === NO_RECUR ? null : recur
    })
    setTitle('')
    setSuggestion(null)
    await refresh()
  }

  const open = tasks.filter((t) => t.status !== 'done')
  const done = tasks.filter((t) => t.status === 'done')

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-border px-4 py-2">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            onClick={() => setScope(s.id)}
            className={`rounded-md px-2.5 py-1 text-[16px] transition-colors ${
              scope === s.id ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-border px-4 py-2">
          {tags.map((t) => (
            <button
              key={t.id}
              onClick={() => setTagId(tagId === t.id ? null : t.id)}
              className={`rounded-full border px-2 py-0.5 text-[13px] transition-colors ${
                tagId === t.id
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border text-muted hover:border-accent hover:text-text'
              }`}
            >
              #{t.name}
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="mb-4 rounded-lg border border-border bg-surface p-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            placeholder="Add a task, then press Enter…"
            className="w-full bg-transparent px-1 py-1 text-[16px] outline-none placeholder:text-faint"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[15px]">
            <input
              type="date"
              value={due}
              onChange={(e) => {
                setDue(e.target.value)
                setDueTouched(true)
              }}
              className="rounded border border-border bg-bg px-1.5 py-1 text-muted outline-none focus:border-accent"
            />
            {suggestion && (
              <button
                type="button"
                onClick={() => {
                  setDue(suggestion)
                  setDueTouched(true)
                  setSuggestion(null)
                }}
                className="rounded border border-dashed border-border px-1.5 py-1 text-muted hover:border-accent hover:text-text"
              >
                Suggest: {suggestion}
              </button>
            )}
            <SimpleSelect
              value={priority}
              onChange={(v) => setPriority(v as Priority)}
              options={PRIORITY_OPTIONS}
              ariaLabel="Priority"
            />
            <SimpleSelect
              value={recur}
              onChange={(v) => setRecur(v as RecurRule | typeof NO_RECUR)}
              options={RECUR_OPTIONS}
              ariaLabel="Repeat"
            />
            <button
              onClick={() => void add()}
              className="ml-auto rounded border border-border px-2 py-1 text-muted hover:border-accent hover:text-text"
            >
              Add
            </button>
          </div>
        </div>

        {tasks.length === 0 ? (
          <p className="py-16 text-center text-[16px] text-faint">
            {scope === 'today' ? 'Nothing due today.' : 'No tasks here.'}
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {open.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onChanged={() => void refresh()}
                  highlighted={t.id === highlightId}
                />
              ))}
              {open.length === 0 && (
                <p className="px-3 py-6 text-center text-[16px] text-faint">All clear.</p>
              )}
            </div>

            {done.length > 0 && (
              <div className="mt-4">
                <div className="px-1 pb-1 text-[13px] uppercase tracking-wider text-faint">
                  Completed
                </div>
                <div className="overflow-hidden rounded-lg border border-border bg-surface opacity-70">
                  {done.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onChanged={() => void refresh()}
                      highlighted={t.id === highlightId}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
