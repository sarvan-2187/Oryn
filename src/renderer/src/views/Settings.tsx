import { useEffect, useState } from 'react'
import { useStore } from '../store'

function Row({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/60 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[15px]">{title}</div>
        {hint && <div className="mt-0.5 break-all text-[13px] text-faint">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

const BUTTON =
  'rounded-md border border-border px-2.5 py-1.5 text-[14px] text-muted hover:border-accent hover:text-text'

export function SettingsView(): React.JSX.Element {
  const { theme, toggleTheme, zoom, setZoom } = useStore()
  const [dbFile, setDbFile] = useState('')
  const [hotkey, setHotkey] = useState('')
  const [draftHotkey, setDraftHotkey] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void window.oryn.data.path().then(setDbFile)
    void window.oryn.capture.getHotkey().then((h) => {
      setHotkey(h)
      setDraftHotkey(h)
    })
  }, [])

  const saveHotkey = async (): Promise<void> => {
    const ok = await window.oryn.capture.setHotkey(draftHotkey.trim())
    if (ok) {
      setHotkey(draftHotkey.trim())
      setStatus('Hotkey updated.')
    } else {
      setDraftHotkey(hotkey)
      setStatus('Windows refused that combination, so the previous one is still active.')
    }
  }

  const backup = async (): Promise<void> => {
    const { path } = await window.oryn.data.backup()
    setStatus(`Backed up to ${path}`)
    void window.oryn.data.reveal(path)
  }

  const exportAll = async (): Promise<void> => {
    setStatus('Exporting…')
    const result = await window.oryn.data.export()
    if (!result) {
      setStatus(null)
      return
    }
    setStatus(`Exported ${result.files} files to ${result.path}`)
    void window.oryn.data.reveal(result.path)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-5 py-5">
        <h1 className="mb-4 text-[22px] font-semibold tracking-tight">Settings</h1>

        <section className="rounded-lg border border-border bg-surface px-4 py-1">
          <Row title="Theme" hint={theme === 'dark' ? 'Deep black' : 'Pearl white'}>
            <button onClick={toggleTheme} className={BUTTON}>
              Switch to {theme === 'dark' ? 'light' : 'dark'}
            </button>
          </Row>

          <Row title="Interface size" hint="Also Ctrl with plus, minus or zero.">
            <button onClick={() => setZoom(zoom - 0.1)} className={BUTTON}>
              Smaller
            </button>
            <span className="w-12 text-center font-mono text-[14px] tabular-nums text-faint">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => setZoom(zoom + 0.1)} className={BUTTON}>
              Larger
            </button>
          </Row>

          <Row
            title="Quick capture hotkey"
            hint="Works anywhere in Windows, even when Oryn is minimised."
          >
            <input
              value={draftHotkey}
              onChange={(e) => setDraftHotkey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void saveHotkey()}
              spellCheck={false}
              className="w-52 rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-[13px] outline-none focus:border-accent"
            />
            <button onClick={() => void saveHotkey()} className={BUTTON}>
              Save
            </button>
          </Row>
        </section>

        <h2 className="mb-2 mt-6 text-[12px] font-medium uppercase tracking-wider text-faint">
          Your data
        </h2>
        <section className="rounded-lg border border-border bg-surface px-4 py-1">
          <Row title="Database file" hint={dbFile}>
            <button onClick={() => void window.oryn.data.reveal(dbFile)} className={BUTTON}>
              Show in folder
            </button>
          </Row>

          <Row
            title="Back up now"
            hint="Copies the whole database with a timestamp. Everything lives in that one file."
          >
            <button onClick={() => void backup()} className={BUTTON}>
              Back up
            </button>
          </Row>

          <Row
            title="Export notes to Markdown"
            hint="A folder per Space plus the journal, readable in any editor."
          >
            <button onClick={() => void exportAll()} className={BUTTON}>
              Export
            </button>
          </Row>
        </section>

        {status && (
          <p className="mt-3 break-all rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-muted">
            {status}
          </p>
        )}

        <p className="mt-6 text-[13px] text-faint">
          Oryn keeps everything on this machine. There is no account and no network access.
        </p>
      </div>
    </div>
  )
}
