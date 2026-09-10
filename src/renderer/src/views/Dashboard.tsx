import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { HabitCheckin } from '../components/HabitCheckin'
import { TaskRow } from '../components/TaskRow'
import { Editor } from '../components/Editor'
import { fromDateStr, today } from '../../../shared/dates'
import type { HabitToday, TaskTree, JournalEntry } from '../../../shared/types'

function Section({
  title,
  right,
  children
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-[13px] font-medium uppercase tracking-wider text-faint">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

export function DashboardView(): React.JSX.Element {
  const { activeSpaceId, theme, setView } = useStore()
  const day = today()
  const [habits, setHabits] = useState<HabitToday[]>([])
  const [tasks, setTasks] = useState<TaskTree[]>([])
  const [counts, setCounts] = useState({ due: 0, overdue: 0, done: 0 })
  const [journal, setJournal] = useState<JournalEntry | null>(null)

  const refresh = useCallback(async () => {
    const [h, t, c] = await Promise.all([
      window.oryn.habits.forDate(day, activeSpaceId),
      window.oryn.tasks.list({ spaceId: activeSpaceId, scope: 'today', date: day }),
      window.oryn.tasks.counts(day, activeSpaceId)
    ])
    setHabits(h)
    setTasks(t)
    setCounts(c)
  }, [activeSpaceId, day])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void window.oryn.journal.get(day).then(setJournal)
  }, [day])

  const saveJournal = useCallback(
    (contentJson: string, contentText: string) => {
      void window.oryn.journal.save(day, contentJson, contentText)
    },
    [day]
  )

  const heading = fromDateStr(day).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })
  const habitsDone = habits.filter((h) => h.done).length

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <header className="mb-6">
          <h1 className="text-[30px] font-semibold tracking-tight">{heading}</h1>
          <p className="mt-1 text-[16px] text-muted">
            {counts.overdue > 0 && <span className="text-danger">{counts.overdue} overdue · </span>}
            {counts.due} due today · {counts.done} done
            {habits.length > 0 && ` · ${habitsDone}/${habits.length} habits`}
          </p>
        </header>

        <Section
          title="Habits"
          right={
            <button
              onClick={() => setView('habits')}
              className="text-[13px] text-faint hover:text-muted"
            >
              manage
            </button>
          }
        >
          <div className="rounded-lg border border-border bg-surface p-3">
            <HabitCheckin habits={habits} date={day} onChanged={() => void refresh()} />
          </div>
        </Section>

        <Section
          title="Today"
          right={
            <button
              onClick={() => setView('tasks')}
              className="text-[13px] text-faint hover:text-muted"
            >
              all tasks
            </button>
          }
        >
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            {tasks.length === 0 ? (
              <p className="px-3 py-6 text-center text-[16px] text-faint">Nothing due today.</p>
            ) : (
              tasks.map((t) => <TaskRow key={t.id} task={t} onChanged={() => void refresh()} />)
            )}
          </div>
        </Section>

        <Section title="Journal">
          <div className="rounded-lg border border-border bg-surface py-2">
            {journal && (
              <Editor
                key={journal.date}
                noteId={journal.id}
                initialContent={journal.content_json}
                theme={theme}
                onSave={saveJournal}
              />
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}
