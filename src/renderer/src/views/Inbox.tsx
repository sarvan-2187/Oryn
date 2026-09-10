import { useCallback, useEffect, useState } from 'react'
import { FileTextIcon, Trash2Icon, SquareCheckIcon } from 'lucide-react'
import { useStore } from '../store'
import { SimpleSelect } from '../components/ui/simple-select'
import type { Capture } from '../../../shared/types'

export function InboxView(): React.JSX.Element {
  const { spaces, setView, setNote } = useStore()
  const [items, setItems] = useState<Capture[]>([])
  const [target, setTarget] = useState<string>('')

  const refresh = useCallback(async () => {
    setItems(await window.oryn.captures.list())
  }, [])

  useEffect(() => {
    void refresh()
    // The popup writes captures from another window, so listen rather than poll.
    return window.oryn.captures.onChanged(() => void refresh())
  }, [refresh])

  useEffect(() => {
    if (!target && spaces.length > 0) {
      const first = spaces.find((s) => !s.is_system)
      if (first) setTarget(String(first.id))
    }
  }, [spaces, target])

  const convert = async (id: number, kind: 'note' | 'task'): Promise<void> => {
    const spaceId = Number(target)
    if (!spaceId) return
    const created = await window.oryn.captures.convert(id, kind, spaceId)
    await refresh()
    if (created?.kind === 'note') {
      setView('notes')
      setNote(created.id)
    }
  }

  const discard = async (id: number): Promise<void> => {
    await window.oryn.captures.delete(id)
    await refresh()
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 py-5">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">Inbox</h1>
          <span className="text-[14px] text-faint">
            {items.length === 0 ? 'Empty' : `${items.length} to sort`}
          </span>
          <div className="ml-auto flex items-center gap-2 text-[13px] text-faint">
            <span>Send to</span>
            <SimpleSelect
              value={target}
              onChange={setTarget}
              options={spaces
                .filter((s) => !s.is_system)
                .map((s) => ({ value: String(s.id), label: s.name }))}
              ariaLabel="Destination space"
            />
          </div>
        </div>

        {items.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-[14px] text-faint">
            Nothing captured yet. Press the global hotkey from anywhere to jot something down.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            {items.map((c) => (
              <div
                key={c.id}
                className="group flex items-start gap-3 border-b border-border/60 px-3 py-3 last:border-0"
              >
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[15px]">
                  {c.text}
                </p>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => void convert(c.id, 'task')}
                    title="Make a task"
                    aria-label="Convert to task"
                    className="grid size-8 place-items-center rounded-md border border-border text-muted hover:border-accent hover:text-text"
                  >
                    <SquareCheckIcon className="size-4" />
                  </button>
                  <button
                    onClick={() => void convert(c.id, 'note')}
                    title="Make a note"
                    aria-label="Convert to note"
                    className="grid size-8 place-items-center rounded-md border border-border text-muted hover:border-accent hover:text-text"
                  >
                    <FileTextIcon className="size-4" />
                  </button>
                  <button
                    onClick={() => void discard(c.id)}
                    title="Discard"
                    aria-label="Discard capture"
                    className="grid size-8 place-items-center rounded-md border border-border text-muted hover:border-danger hover:text-danger"
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
