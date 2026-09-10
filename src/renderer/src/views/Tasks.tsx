import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { TaskRow, PRIORITY_OPTIONS, RECUR_OPTIONS, NO_RECUR } from '../components/TaskRow'
import { SimpleSelect } from '../components/ui/simple-select'
import { today } from '../../../shared/dates'
import type { TaskTree, Priority, RecurRule } from '../../../shared/types'

type Scope = 'today' | 'upcoming' | 'someday' | 'all'

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'someday', label: 'No date' },
  { id: 'all', label: 'All' }
]

export function TasksView(): React.JSX.Element {
  const { activeSpaceId, spaces } = useStore()
  const [scope, setScope] = useState<Scope>('today')
  const [tasks, setTasks] = useState<TaskTree[]>([])

  const [title, setTitle] = useState('')
  const [due, setDue] = useState(today())
  const [priority, setPriority] = useState<Priority>('med')
  const [recur, setRecur] = useState<RecurRule | typeof NO_RECUR>(NO_RECUR)

  const refresh = useCallback(async () => {
    setTasks(await window.oryn.tasks.list({ spaceId: activeSpaceId, scope }))
  }, [activeSpaceId, scope])

  useEffect(() => {
    void refresh()
  }, [refresh])

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
              onChange={(e) => setDue(e.target.value)}
              className="rounded border border-border bg-bg px-1.5 py-1 text-muted outline-none focus:border-accent"
            />
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
                <TaskRow key={t.id} task={t} onChanged={() => void refresh()} />
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
                    <TaskRow key={t.id} task={t} onChanged={() => void refresh()} />
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
