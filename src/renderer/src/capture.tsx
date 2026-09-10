import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

/**
 * The quick-capture window. Deliberately one input and nothing else: the whole
 * point is that a thought reaches the app before the thought is gone.
 */
function Capture(): React.JSX.Element {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  // The window is hidden rather than destroyed, so each reopen has to clear
  // the previous text and take focus again.
  useEffect(() => {
    const onOpened = (): void => {
      setText('')
      setSaved(false)
      ref.current?.focus()
    }
    window.oryn.capture.onOpened(onOpened)
    ref.current?.focus()
  }, [])

  const save = async (): Promise<void> => {
    const value = text.trim()
    if (!value) {
      void window.oryn.capture.close()
      return
    }
    await window.oryn.capture.save(value)
    setText('')
    setSaved(true)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      void window.oryn.capture.close()
    }
    // Enter saves; Shift+Enter keeps a multi-line thought together.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void save()
    }
  }

  return (
    <div className="flex h-full flex-col justify-center gap-2 border border-border bg-surface px-4 py-3">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setSaved(false)
        }}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="Capture a thought…"
        className="w-full resize-none bg-transparent text-[17px] leading-snug outline-none placeholder:text-faint"
      />
      <div className="flex items-center justify-between text-[13px] text-faint">
        <span>{saved ? 'Saved to Inbox' : 'Enter to save · Shift+Enter for a new line'}</span>
        <span>Esc to close</span>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Capture />
  </StrictMode>
)
