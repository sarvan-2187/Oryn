import { useCallback, useEffect, useState } from 'react'
import { PaperclipIcon, Trash2Icon } from 'lucide-react'
import type { Attachment } from '../../../shared/types'

export function TaskAttachments({ taskId }: { taskId: number }): React.JSX.Element {
  const [files, setFiles] = useState<Attachment[]>([])

  const refresh = useCallback(async () => {
    setFiles(await window.oryn.attachments.list('task', taskId))
  }, [taskId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addFile = async (): Promise<void> => {
    const added = await window.oryn.attachments.addFile('task', taskId)
    if (added) await refresh()
  }

  const remove = async (id: number): Promise<void> => {
    await window.oryn.attachments.delete(id)
    await refresh()
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {files.map((f) => (
        <span
          key={f.id}
          className="flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-[13px] text-muted"
        >
          <button
            onClick={() => void window.oryn.attachments.open(f.id)}
            className="max-w-[140px] truncate hover:text-text"
            title={f.filename}
          >
            {f.filename}
          </button>
          <button onClick={() => void remove(f.id)} aria-label={`Remove ${f.filename}`}>
            <Trash2Icon className="size-3 hover:text-danger" />
          </button>
        </span>
      ))}
      <button
        onClick={() => void addFile()}
        className="flex items-center gap-1 text-[13px] text-faint hover:text-text"
      >
        <PaperclipIcon className="size-3.5" /> Attach file
      </button>
    </div>
  )
}
