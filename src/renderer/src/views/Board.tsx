import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { daysBetween, today } from '../../../shared/dates'
import type { TaskTree, TaskStatus, Priority } from '../../../shared/types'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done' }
]

const PRIORITY_DOT: Record<Priority, string> = {
  high: 'var(--color-danger)',
  med: 'var(--color-warn)',
  low: 'var(--color-faint)'
}

export function BoardView(): React.JSX.Element {
  const { activeSpaceId, spaces } = useStore()
  const [tasks, setTasks] = useState<TaskTree[]>([])
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)

  const refresh = useCallback(async () => {
    setTasks(await window.oryn.tasks.list({ spaceId: activeSpaceId, scope: 'all' }))
  }, [activeSpaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Moving a card is a status change. Dropping into Done routes through toggle
   * rather than a plain update, so completion timestamps and recurring
   * follow-ups behave exactly as they do everywhere else.
   */
  const moveTo = async (id: number, status: TaskStatus): Promise<void> => {
    const task = tasks.find((t) => t.id === id)
    if (!task || task.status === status) return

    if (status === 'done' || task.status === 'done') await window.oryn.tasks.toggle(id)
    if (status !== 'done') await window.oryn.tasks.update(id, { status })

    setDragging(null)
    setOver(null)
    await refresh()
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-2.5">
        <h1 className="text-[16px] font-semibold tracking-tight">Board</h1>
        <span className="text-[13px] text-faint">
          {activeSpaceId == null
            ? 'All spaces'
            : (spaces.find((s) => s.id === activeSpaceId)?.name ?? '')}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.id)
          return (
            <section
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(col.id)
              }}
              onDragLeave={() => setOver((c) => (c === col.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault()
                if (dragging != null) void moveTo(dragging, col.id)
              }}
              className={`flex w-80 shrink-0 flex-col rounded-lg border bg-surface transition-colors ${
                over === col.id ? 'border-accent' : 'border-border'
              }`}
            >
              <header className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-[14px] font-medium">{col.label}</span>
                <span className="text-[13px] tabular-nums text-faint">{items.length}</span>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {items.length === 0 && (
                  <p className="px-2 py-8 text-center text-[13px] text-faint">
                    {over === col.id ? 'Drop here' : 'Nothing here'}
                  </p>
                )}
                {items.map((t) => {
                  const space = spaces.find((s) => s.id === t.space_id)
                  const overdue =
                    t.due_date != null &&
                    t.status !== 'done' &&
                    daysBetween(today(), t.due_date) < 0
                  return (
                    <article
                      key={t.id}
                      draggable
                      onDragStart={() => setDragging(t.id)}
                      onDragEnd={() => {
                        setDragging(null)
                        setOver(null)
                      }}
                      className={`cursor-grab rounded-md border border-border bg-bg p-2.5 active:cursor-grabbing ${
                        dragging === t.id ? 'opacity-50' : ''
                      }`}
                    >
                      <div
                        className={`text-[14px] ${t.status === 'done' ? 'text-faint line-through' : ''}`}
                      >
                        {t.title}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[12px] text-faint">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: PRIORITY_DOT[t.priority] }}
                          title={`${t.priority} priority`}
                        />
                        {space && (
                          <span className="flex items-center gap-1">
                            <span
                              className="size-1.5 rounded-full"
                              style={{ background: space.color }}
                            />
                            {space.name}
                          </span>
                        )}
                        {t.due_date && (
                          <span className={overdue ? 'ml-auto text-danger' : 'ml-auto'}>
                            {t.due_date.slice(5)}
                          </span>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
