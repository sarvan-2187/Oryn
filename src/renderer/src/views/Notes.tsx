import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { Editor } from '../components/Editor'
import { confirmDialog } from '../components/ConfirmDialog'
import { SimpleSelect } from '../components/ui/simple-select'
import { ArchiveIcon, ArchiveRestoreIcon, PlusIcon, StarIcon, Trash2Icon } from 'lucide-react'
import { firstLine } from '../lib/blocks'
import type { Note, NoteSummary, Tag } from '../../../shared/types'

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
  const [tags, setTags] = useState<Tag[]>([])
  const [tagId, setTagId] = useState<number | null>(null)

  useEffect(() => {
    void window.oryn.tags.list().then(setTags)
  }, [])

  const refresh = useCallback(async () => {
    const rows = filter.trim()
      ? await window.oryn.notes.search(filter, activeSpaceId)
      : await window.oryn.notes.list({ spaceId: activeSpaceId, archived, tagId })
    setList(rows)
  }, [activeSpaceId, archived, filter, tagId])

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

  const togglePin = async (): Promise<void> => {
    if (!note) return
    const next = !note.is_pinned
    setNoteData({ ...note, is_pinned: next ? 1 : 0 })
    await window.oryn.notes.update(note.id, { isPinned: next })
    await refresh()
  }

  const moveToSpace = async (spaceId: number): Promise<void> => {
    if (!note) return
    setNoteData({ ...note, space_id: spaceId })
    await window.oryn.notes.update(note.id, { spaceId })
    await refresh()
  }

  /** Permanent, so it is only offered from the archive and asks first. */
  const destroy = async (): Promise<void> => {
    if (!note) return
    const ok = await confirmDialog(
      `Permanently delete "${note.title || 'Untitled'}"? This cannot be undone.`
    )
    if (!ok) return
    await window.oryn.notes.delete(note.id)
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
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-[16px] outline-none placeholder:text-faint focus:border-accent"
          />
          {!archived && (
            <button
              onClick={create}
              title="New note"
              aria-label="New note"
              className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-muted hover:border-accent hover:text-text"
            >
              <PlusIcon className="size-4.5" />
            </button>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 px-2 pb-2">
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

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {list.length === 0 && (
            <p className="px-2 py-6 text-center text-[16px] text-faint">
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
                <div className="flex items-center gap-1 truncate text-[16px] font-medium">
                  {n.is_pinned ? (
                    <StarIcon className="size-3.5 shrink-0 fill-warn text-warn" />
                  ) : null}
                  <span className="truncate">{n.title || 'Untitled'}</span>
                </div>
                <div className="truncate text-[15px] text-faint">{n.excerpt || 'Empty note'}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[13px] text-faint">
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
            {/* Matches the editor's 54px gutter so the title lines up with the body. */}
            <div className="flex items-center gap-2 border-b border-border py-3 pl-[54px] pr-4">
              <input
                value={note.title}
                onChange={(e) => void rename(e.target.value)}
                placeholder="Untitled"
                className="min-w-0 flex-1 bg-transparent text-[25px] font-semibold tracking-tight outline-none placeholder:text-faint"
              />
              <button
                onClick={() => void togglePin()}
                title={note.is_pinned ? 'Unpin' : 'Pin to top'}
                aria-label={note.is_pinned ? 'Unpin note' : 'Pin note'}
                className={`grid size-8 shrink-0 place-items-center rounded-md border ${
                  note.is_pinned
                    ? 'border-warn text-warn'
                    : 'border-border text-muted hover:border-accent hover:text-text'
                }`}
              >
                <StarIcon className={`size-4 ${note.is_pinned ? 'fill-warn' : ''}`} />
              </button>
              <SimpleSelect
                value={String(note.space_id)}
                onChange={(v) => void moveToSpace(Number(v))}
                options={spaces
                  .filter((s) => !s.is_system)
                  .map((s) => ({ value: String(s.id), label: s.name }))}
                className="shrink-0"
                title="Move to space"
                ariaLabel="Move to space"
              />
              <button
                onClick={toggleArchive}
                title={archived ? 'Restore from archive' : 'Archive'}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[15px] text-muted hover:border-accent hover:text-text"
              >
                {archived ? (
                  <ArchiveRestoreIcon className="size-4" />
                ) : (
                  <ArchiveIcon className="size-4" />
                )}
                {archived ? 'Restore' : 'Archive'}
              </button>
              <button
                onClick={() => void destroy()}
                title="Delete permanently"
                aria-label="Delete note permanently"
                className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted hover:border-danger hover:text-danger"
              >
                <Trash2Icon className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
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
          <div className="flex flex-1 items-center justify-center text-[16px] text-faint">
            Select a note, or press + to create one.
          </div>
        )}
      </div>
    </div>
  )
}
