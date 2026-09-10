import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import type { PartialBlock } from '@blocknote/core'
import '@blocknote/mantine/style.css'
import { blocksToText } from '../lib/blocks'

interface Props {
  /** Remount key: the editor is created once per note. */
  noteId: number
  initialContent: string
  theme: 'dark' | 'light'
  onSave: (contentJson: string, contentText: string) => void
}

const SAVE_DEBOUNCE_MS = 500

export function Editor({ noteId, initialContent, theme, onSave }: Props): React.JSX.Element {
  const parsed = useMemo<PartialBlock[] | undefined>(() => {
    try {
      const blocks = JSON.parse(initialContent)
      return Array.isArray(blocks) && blocks.length > 0 ? (blocks as PartialBlock[]) : undefined
    } catch {
      return undefined
    }
  }, [initialContent])

  const editor = useCreateBlockNote({ initialContent: parsed }, [noteId])

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<(() => void) | null>(null)

  const handleChange = useCallback(() => {
    const blocks = editor.document
    pending.current = () => onSave(JSON.stringify(blocks), blocksToText(blocks))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      pending.current?.()
      pending.current = null
    }, SAVE_DEBOUNCE_MS)
  }, [editor, onSave])

  // A pending edit must not be lost when switching notes or closing the app.
  useEffect(() => {
    const flush = (): void => {
      if (timer.current) clearTimeout(timer.current)
      pending.current?.()
      pending.current = null
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [noteId])

  return (
    <BlockNoteView
      editor={editor}
      theme={theme}
      onChange={handleChange}
      className="oryn-editor"
    />
  )
}
