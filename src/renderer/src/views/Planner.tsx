import { useCallback, useEffect, useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { useStore } from '../store'
import { SimpleSelect } from '../components/ui/simple-select'
import { daysBetween, today } from '../../../shared/dates'
import type { ClassSlot, Deadline, DeadlineKind } from '../../../shared/types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEK = [1, 2, 3, 4, 5, 6, 0] // Monday-first, as a timetable is normally read

const KIND_OPTIONS = [
  { value: 'exam', label: 'Exam' },
  { value: 'submission', label: 'Submission' },
  { value: 'hackathon', label: 'Hackathon' }
]

const FIELD =
  'rounded border border-border bg-bg px-2 py-1.5 text-[15px] text-muted outline-none focus:border-accent'

/** Days remaining, phrased the way you would say it out loud. */
export function countdown(date: string): { text: string; urgent: boolean } {
  const diff = daysBetween(today(), date)
  if (diff < 0) return { text: `${Math.abs(diff)}d ago`, urgent: false }
  if (diff === 0) return { text: 'Today', urgent: true }
  if (diff === 1) return { text: 'Tomorrow', urgent: true }
  return { text: `${diff} days`, urgent: diff <= 7 }
}

export function PlannerView(): React.JSX.Element {
  const { spaces, activeSpaceId } = useStore()
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [classes, setClasses] = useState<ClassSlot[]>([])

  const [dTitle, setDTitle] = useState('')
  const [dDate, setDDate] = useState(today())
  const [dKind, setDKind] = useState<DeadlineKind>('exam')

  const [cSubject, setCSubject] = useState('')
  const [cDay, setCDay] = useState('1')
  const [cStart, setCStart] = useState('09:00')
  const [cEnd, setCEnd] = useState('10:00')
  const [cLocation, setCLocation] = useState('')

  const refresh = useCallback(async () => {
    const [d, c] = await Promise.all([
      window.oryn.deadlines.list({ spaceId: activeSpaceId }),
      window.oryn.classes.list()
    ])
    setDeadlines(d)
    setClasses(c)
  }, [activeSpaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addDeadline = async (): Promise<void> => {
    const title = dTitle.trim()
    const space = activeSpaceId ?? spaces.find((s) => !s.is_system)?.id
    if (!title || space == null) return
    await window.oryn.deadlines.create({ spaceId: space, title, date: dDate, kind: dKind })
    setDTitle('')
    await refresh()
  }

  const addClass = async (): Promise<void> => {
    const subject = cSubject.trim()
    if (!subject) return
    if (cEnd <= cStart) {
      alert('The end time has to be after the start time.')
      return
    }
    await window.oryn.classes.create({
      subject,
      dayOfWeek: Number(cDay),
      startTime: cStart,
      endTime: cEnd,
      location: cLocation.trim()
    })
    setCSubject('')
    setCLocation('')
    await refresh()
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 py-5">
        <h1 className="mb-4 text-[22px] font-semibold tracking-tight">Planner</h1>

        <section className="mb-8">
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-faint">
            Deadlines
          </h2>

          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2">
            <input
              value={dTitle}
              onChange={(e) => setDTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addDeadline()}
              placeholder="Exam, submission or hackathon…"
              className="min-w-48 flex-1 bg-transparent px-1 text-[15px] outline-none placeholder:text-faint"
            />
            <input
              type="date"
              value={dDate}
              onChange={(e) => setDDate(e.target.value)}
              className={FIELD}
            />
            <SimpleSelect
              value={dKind}
              onChange={(v) => setDKind(v as DeadlineKind)}
              options={KIND_OPTIONS}
              ariaLabel="Deadline kind"
            />
            <button
              onClick={() => void addDeadline()}
              className="rounded border border-border px-2.5 py-1.5 text-[15px] text-muted hover:border-accent hover:text-text"
            >
              Add
            </button>
          </div>

          {deadlines.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-[14px] text-faint">
              Nothing scheduled.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {deadlines.map((d) => {
                const c = countdown(d.date)
                const space = spaces.find((s) => s.id === d.space_id)
                return (
                  <div
                    key={d.id}
                    className="group flex items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-0"
                  >
                    <span
                      className="rounded px-1.5 py-0.5 text-[12px] uppercase tracking-wide text-faint"
                      style={{ background: 'var(--color-surface-2)' }}
                    >
                      {d.kind}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px]">{d.title}</span>
                    {space && (
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: space.color }}
                        title={space.name}
                      />
                    )}
                    <span className="shrink-0 text-[13px] text-faint">{d.date}</span>
                    <span
                      className={`w-20 shrink-0 text-right text-[14px] ${
                        c.urgent ? 'text-danger' : 'text-muted'
                      }`}
                    >
                      {c.text}
                    </span>
                    <button
                      onClick={() =>
                        void window.oryn.deadlines.delete(d.id).then(() => void refresh())
                      }
                      aria-label={`Delete ${d.title}`}
                      className="shrink-0 text-faint opacity-0 hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2Icon className="size-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-faint">
            Timetable
          </h2>

          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2">
            <input
              value={cSubject}
              onChange={(e) => setCSubject(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addClass()}
              placeholder="Subject or lab…"
              className="min-w-40 flex-1 bg-transparent px-1 text-[15px] outline-none placeholder:text-faint"
            />
            <SimpleSelect
              value={cDay}
              onChange={setCDay}
              options={WEEK.map((d) => ({ value: String(d), label: DAYS[d] }))}
              ariaLabel="Day"
            />
            <input
              type="time"
              value={cStart}
              onChange={(e) => setCStart(e.target.value)}
              className={FIELD}
            />
            <input
              type="time"
              value={cEnd}
              onChange={(e) => setCEnd(e.target.value)}
              className={FIELD}
            />
            <input
              value={cLocation}
              onChange={(e) => setCLocation(e.target.value)}
              placeholder="Room"
              className={`${FIELD} w-24 placeholder:text-faint`}
            />
            <button
              onClick={() => void addClass()}
              className="rounded border border-border px-2.5 py-1.5 text-[15px] text-muted hover:border-accent hover:text-text"
            >
              Add
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {WEEK.map((day) => {
              const slots = classes.filter((c) => c.day_of_week === day)
              if (slots.length === 0) return null
              return (
                <div key={day} className="rounded-lg border border-border bg-surface p-3">
                  <div className="mb-2 text-[13px] font-medium">{DAYS[day]}</div>
                  {slots.map((s) => (
                    <div key={s.id} className="group flex items-baseline gap-2 py-1">
                      <span className="font-mono text-[13px] tabular-nums text-faint">
                        {s.start_time}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px]">{s.subject}</span>
                      {s.location && <span className="text-[12px] text-faint">{s.location}</span>}
                      <button
                        onClick={() =>
                          void window.oryn.classes.delete(s.id).then(() => void refresh())
                        }
                        aria-label={`Delete ${s.subject}`}
                        className="text-faint opacity-0 hover:text-danger group-hover:opacity-100"
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            })}
            {classes.length === 0 && (
              <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-[14px] text-faint sm:col-span-2 lg:col-span-3">
                No classes added yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
