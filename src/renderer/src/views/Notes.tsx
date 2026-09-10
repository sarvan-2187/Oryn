import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { Editor } from '../components/Editor'
import { firstLine } from '../lib/blocks'
import type { Note, NoteSummary } from '../../../shared/types'

function relative(iso: string): string {
  const then = new Date(iso.replace(' ', 'T') + 'Z').getTime()
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

export function NotesView({ archived }: { archived: boolean }): React.JSX.Element {
  const { activeSpaceId, activeNoteId, setNote, spaces, theme } = useStore()
  const [list, setList] = useState<NoteSummary[]>([])
  const [note, setNoteData] = useState<Note | null>(null)
  const [filter, setFilter] = useState('')

  const refresh = useCallback(async () => {
    const rows = filter.trim()
      ? await window.oryn.notes.search(filter, activeSpaceId)
      : await window.oryn.notes.list({ spaceId: activeSpaceId, archived })
    setList(rows)
  }, [activeSpaceId, archived, filter])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (activeNoteId == null) {
      setNoteData(null)
      return
    }
    void window.oryn.notes.get(activeNoteId).then((n) => setNoteData(n ?? null))
  }, [activeNoteId])

  const create = async (): Promise<void> => {
    // "All spaces" has no home for a new note, so it lands in the first real space.
    const target = activeSpaceId ?? spaces.find((s) => !s.is_system)?.id
    if (target == null) return
    const created = await window.oryn.notes.create({ spaceId: target })
    await refresh()
    setNote(created.id)
  }

  const save = useCallback(
    async (contentJson: string, contentText: string) => {
      if (!note) return
      // An untitled note takes its name from its first line, like Apple Notes.
      const title = note.title.trim() || firstLine(contentText)
      await window.oryn.notes.update(note.id, { contentJson, contentText, title })
      await refresh()
    },
    [note, refresh]
  )

  const rename = async (title: string): Promise<void> => {
    if (!note) return
    setNoteData({ ...note, title })
    await window.oryn.notes.update(note.id, { title })
    await refresh()
  }

  const toggleArchive = async (): Promise<void> => {
    if (!note) return
    await window.oryn.notes.archive(note.id, !archived)
    setNote(null)
    await refresh()
  }

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 p-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={archived ? 'Search archive…' : 'Filter notes…'}
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-[13px] outline-none placeholder:text-faint focus:border-accent"
          />
          {!archived && (
            <button
              onClick={create}
              title="New note"
              className="shrink-0 rounded-md border border-border px-2 py-1.5 text-[13px] text-muted hover:border-accent hover:text-text"
            >
              +
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {list.length === 0 && (
            <p className="px-2 py-6 text-center text-[13px] text-faint">
              {filter ? 'No matches.' : archived ? 'Nothing archived.' : 'No notes yet.'}
            </p>
          )}
          {list.map((n) => {
            const space = spaces.find((s) => s.id === n.space_id)
            return (
              <button
                key={n.id}
                onClick={() => setNote(n.id)}
                className={`mb-0.5 block w-full rounded-md px-2 py-2 text-left transition-colors ${
                  activeNoteId === n.id ? 'bg-surface-2' : 'hover:bg-surface'
                }`}
              >
                <div className="truncate text-[13px] font-medium">{n.title || 'Untitled'}</div>
                <div className="truncate text-[12px] text-faint">{n.excerpt || 'Empty note'}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
                  {space && (
                    <span className="size-1.5 rounded-full" style={{ background: space.color }} />
                  )}
                  <span>{relative(n.updated_at)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {note ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-6 py-3">
              <input
                value={note.title}
                onChange={(e) => void rename(e.target.value)}
                placeholder="Untitled"
                className="min-w-0 flex-1 bg-transparent text-[20px] font-semibold tracking-tight outline-none placeholder:text-faint"
              />
              <button
                onClick={toggleArchive}
                className="shrink-0 rounded-md border border-border px-2 py-1 text-[12px] text-muted hover:border-accent hover:text-text"
              >
                {archived ? 'Restore' : 'Archive'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <Editor
                key={note.id}
                noteId={note.id}
                initialContent={note.content_json}
                theme={theme}
                onSave={save}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px] text-faint">
            Select a note, or press + to create one.
          </div>
        )}
      </div>
    </div>
  )
}
