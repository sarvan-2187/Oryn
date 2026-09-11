import { useState } from 'react'
import { useStore } from '../store'
import { confirmDialog } from './ConfirmDialog'
import { SimpleSelect } from './ui/simple-select'
import { CheckIcon, PencilIcon, RepeatIcon, Trash2Icon } from 'lucide-react'
import { daysBetween, today } from '../../../shared/dates'
import type { Task, TaskTree, Priority, RecurRule } from '../../../shared/types'

export const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'med', label: 'Medium' },
  { value: 'low', label: 'Low' }
]

/** Radix rejects an empty option value, so "no recurrence" needs a sentinel. */
export const NO_RECUR = 'none'

export const RECUR_OPTIONS = [
  { value: NO_RECUR, label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
]

const PRIORITY_DOT: Record<Priority, string> = {
  high: 'var(--color-danger)',
  med: 'var(--color-warn)',
  low: 'var(--color-faint)'
}

/** Human due-date label. Overdue reads as a count, not a raw date. */
function dueLabel(due: string): { text: string; overdue: boolean } {
  const diff = daysBetween(today(), due)
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, overdue: true }
  if (diff === 0) return { text: 'Today', overdue: false }
  if (diff === 1) return { text: 'Tomorrow', overdue: false }
  if (diff < 7) return { text: `In ${diff}d`, overdue: false }
  return { text: due.slice(5), overdue: false }
}

function Checkbox({ done, onClick }: { done: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={done ? 'Mark as not done' : 'Mark as done'}
      className={`mt-px grid size-5 shrink-0 place-items-center rounded-[5px] border transition-colors ${
        done ? 'border-success bg-success text-bg' : 'border-border hover:border-accent'
      }`}
    >
      {done && <CheckIcon className="size-3.5" strokeWidth={3} />}
    </button>
  )
}

const FIELD =
  'rounded border border-border bg-bg px-1.5 py-1 text-[15px] text-muted outline-none focus:border-accent'

/** Inline editor for every field of a task. Escape cancels, Enter saves. */
function TaskEditor({ task, onDone }: { task: Task; onDone: () => void }): React.JSX.Element {
  const { spaces } = useStore()
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [priority, setPriority] = useState<Priority>(task.priority)
  const [recur, setRecur] = useState<RecurRule | typeof NO_RECUR>(task.recur_rule ?? NO_RECUR)
  const [spaceId, setSpaceId] = useState(task.space_id)

  const save = async (): Promise<void> => {
    const text = title.trim()
    if (!text) return
    await window.oryn.tasks.update(task.id, {
      title: text,
      description,
      dueDate: dueDate || null,
      priority,
      recurRule: recur === NO_RECUR ? null : recur,
      spaceId
    })
    onDone()
  }

  return (
    <div className="border-l-2 border-accent bg-surface-2/40 px-3 py-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') onDone()
        }}
        className="w-full bg-transparent text-[16px] outline-none"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Notes…"
        className="mt-1 w-full bg-transparent text-[15px] text-muted outline-none placeholder:text-faint"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className={FIELD}
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
        <SimpleSelect
          value={String(spaceId)}
          onChange={(v) => setSpaceId(Number(v))}
          options={spaces
            .filter((s) => !s.is_system)
            .map((s) => ({ value: String(s.id), label: s.name }))}
          ariaLabel="Space"
        />
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={onDone}
            className="rounded border border-border px-2 py-1 text-[15px] text-faint hover:text-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            className="rounded border border-accent bg-accent/15 px-2 py-1 text-[15px] text-accent"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  task: TaskTree
  onChanged: () => void
}

export function TaskRow({ task, onChanged }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingChild, setEditingChild] = useState<number | null>(null)
  const [subtitle, setSubtitle] = useState('')
  const done = task.status === 'done'
  const due = task.due_date ? dueLabel(task.due_date) : null
  const openChildren = task.children.filter((c) => c.status !== 'done').length

  const toggle = async (id: number): Promise<void> => {
    await window.oryn.tasks.toggle(id)
    onChanged()
  }

  const remove = async (id: number, label: string): Promise<void> => {
    if (!(await confirmDialog(`Delete "${label}"?`))) return
    await window.oryn.tasks.delete(id)
    onChanged()
  }

  const addSubtask = async (): Promise<void> => {
    const title = subtitle.trim()
    if (!title) return
    await window.oryn.tasks.create({ spaceId: task.space_id, title, parentId: task.id })
    setSubtitle('')
    onChanged()
  }

  if (editing) {
    return (
      <div className="border-b border-border/60 last:border-0">
        <TaskEditor
          task={task}
          onDone={() => {
            setEditing(false)
            onChanged()
          }}
        />
      </div>
    )
  }

  return (
    <div className="border-b border-border/60 last:border-0">
      <div className="group flex items-start gap-2.5 px-3 py-2">
        <Checkbox done={done} onClick={() => void toggle(task.id)} />

        <button
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-left"
          title={task.children.length > 0 ? 'Show subtasks' : 'Add a subtask'}
        >
          <span className={`text-[16px] ${done ? 'text-faint line-through' : ''}`}>
            {task.title}
          </span>
          {task.children.length > 0 && (
            <span className="ml-2 text-[13px] text-faint">
              {task.children.length - openChildren}/{task.children.length}
            </span>
          )}
          {task.description && (
            <span className="block truncate text-[13px] text-faint">{task.description}</span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-2 text-[13px]">
          {task.recur_rule && (
            <RepeatIcon className="size-4 text-faint" aria-label={`Repeats ${task.recur_rule}`} />
          )}
          {due && (
            <span className={due.overdue && !done ? 'text-danger' : 'text-faint'}>{due.text}</span>
          )}
          <span
            className="size-2.5 rounded-full"
            style={{ background: PRIORITY_DOT[task.priority] }}
            title={`${task.priority} priority`}
          />
          <button
            onClick={() => setEditing(true)}
            className="text-faint opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
            aria-label="Edit task"
            title="Edit"
          >
            <PencilIcon className="size-4" />
          </button>
          <button
            onClick={() => void remove(task.id, task.title)}
            className="text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
            aria-label="Delete task"
            title="Delete"
          >
            <Trash2Icon className="size-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="pb-2 pl-9 pr-3">
          {task.children.map((c: Task) =>
            editingChild === c.id ? (
              <TaskEditor
                key={c.id}
                task={c}
                onDone={() => {
                  setEditingChild(null)
                  onChanged()
                }}
              />
            ) : (
              <div key={c.id} className="group/sub flex items-center gap-2.5 py-1">
                <Checkbox done={c.status === 'done'} onClick={() => void toggle(c.id)} />
                <span
                  className={`flex-1 text-[15px] ${
                    c.status === 'done' ? 'text-faint line-through' : 'text-muted'
                  }`}
                >
                  {c.title}
                </span>
                <button
                  onClick={() => setEditingChild(c.id)}
                  className="text-faint opacity-0 hover:text-text group-hover/sub:opacity-100"
                  aria-label="Edit subtask"
                >
                  <PencilIcon className="size-3.5" />
                </button>
                <button
                  onClick={() => void remove(c.id, c.title)}
                  className="text-faint opacity-0 hover:text-danger group-hover/sub:opacity-100"
                  aria-label="Delete subtask"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            )
          )}
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addSubtask()}
            placeholder="Add a subtask…"
            className="mt-1 w-full bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
        </div>
      )}
    </div>
  )
}
