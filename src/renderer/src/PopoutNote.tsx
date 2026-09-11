import { useCallback, useEffect, useState } from 'react'
import { useStore } from './store'
import { Editor } from './components/Editor'
import type { Note } from '../../shared/types'

/**
 * A note opened in its own window, via popOutNote() / ?note=<id> — same
 * renderer bundle as the main shell, just a different root component. No
 * sidebar, no space switcher: just the title and the editor.
 */
export function PopoutNote({ noteId }: { noteId: number }): React.JSX.Element {
  const theme = useStore((s) => s.theme)
  const [note, setNote] = useState<Note | null>(null)

  const load = useCallback(async () => {
    setNote((await window.oryn.notes.get(noteId)) ?? null)
  }, [noteId])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(
    (contentJson: string, contentText: string) => {
      void window.oryn.notes.update(noteId, { contentJson, contentText })
    },
    [noteId]
  )

  const rename = async (title: string): Promise<void> => {
    if (!note) return
    setNote({ ...note, title })
    await window.oryn.notes.update(noteId, { title })
  }

  if (!note) return <div className="h-full bg-bg" />

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <div className="border-b border-border px-4 py-3">
        <input
          value={note.title}
          onChange={(e) => void rename(e.target.value)}
          placeholder="Untitled"
          className="w-full bg-transparent text-[20px] font-semibold tracking-tight outline-none placeholder:text-faint"
        />
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
    </div>
  )
}
