import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { PinInput } from '../components/PinInput'
import type { Template } from '../../../shared/types'

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
  const { theme, toggleTheme, zoom, setZoom, spaces, activeSpaceId } = useStore()
  const [dbFile, setDbFile] = useState('')
  const [hotkey, setHotkey] = useState('')
  const [draftHotkey, setDraftHotkey] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateTitle, setTemplateTitle] = useState('')
  const [templateItems, setTemplateItems] = useState('')
  const [pinSet, setPinSet] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [idleMinutes, setIdleMinutesState] = useState(10)

  useEffect(() => {
    void window.oryn.lock.isSet().then(setPinSet)
    void window.oryn.lock.getIdleMinutes().then(setIdleMinutesState)
  }, [])

  useEffect(() => {
    void window.oryn.data.path().then(setDbFile)
    void window.oryn.capture.getHotkey().then((h) => {
      setHotkey(h)
      setDraftHotkey(h)
    })
  }, [])

  const refreshTemplates = async (): Promise<void> => {
    setTemplates(await window.oryn.templates.list())
  }

  useEffect(() => {
    void refreshTemplates()
  }, [])

  const addTemplate = async (): Promise<void> => {
    const title = templateTitle.trim()
    const items = templateItems
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!title || items.length === 0) return
    await window.oryn.templates.create(title, items)
    setTemplateTitle('')
    setTemplateItems('')
    await refreshTemplates()
  }

  const removeTemplate = async (id: number): Promise<void> => {
    await window.oryn.templates.delete(id)
    await refreshTemplates()
  }

  const spawnTemplate = async (id: number): Promise<void> => {
    const target = activeSpaceId ?? spaces.find((s) => !s.is_system)?.id
    if (target == null) return
    await window.oryn.templates.spawn(id, target)
    setStatus('Added to today.')
  }

  const savePin = async (): Promise<void> => {
    if (newPin.length !== 4) {
      setStatus('PIN must be 4 digits.')
      return
    }
    if (newPin !== confirmPin) {
      setStatus("PINs don't match.")
      return
    }
    await window.oryn.lock.setPin(newPin)
    setNewPin('')
    setConfirmPin('')
    setPinSet(true)
    setStatus('PIN set.')
  }

  const removePin = async (): Promise<void> => {
    await window.oryn.lock.clear()
    setPinSet(false)
    setStatus('Lock removed.')
  }

  const saveIdleMinutes = async (n: number): Promise<void> => {
    setIdleMinutesState(n)
    await window.oryn.lock.setIdleMinutes(n)
  }

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

        <h2 className="mb-2 mt-6 text-[12px] font-medium uppercase tracking-wider text-faint">
          Checklist templates
        </h2>
        <section className="rounded-lg border border-border bg-surface p-3">
          <input
            value={templateTitle}
            onChange={(e) => setTemplateTitle(e.target.value)}
            placeholder="Template name, e.g. Morning routine"
            className="w-full bg-transparent px-1 py-1 text-[15px] outline-none placeholder:text-faint"
          />
          <textarea
            value={templateItems}
            onChange={(e) => setTemplateItems(e.target.value)}
            placeholder="One item per line"
            rows={3}
            className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-[14px] outline-none placeholder:text-faint focus:border-accent"
          />
          <button onClick={() => void addTemplate()} className={`${BUTTON} mt-2`}>
            Add template
          </button>

          {templates.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px]">{t.title}</div>
                    <div className="text-[12px] text-faint">{t.items.length} items</div>
                  </div>
                  <button onClick={() => void spawnTemplate(t.id)} className={BUTTON}>
                    Add to today
                  </button>
                  <button onClick={() => void removeTemplate(t.id)} className={BUTTON}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <h2 className="mb-2 mt-6 text-[12px] font-medium uppercase tracking-wider text-faint">
          App lock
        </h2>
        <section className="rounded-lg border border-border bg-surface px-4 py-1">
          {pinSet ? (
            <>
              <Row
                title="PIN lock is on"
                hint="A UI-level deterrent, not encryption — the database file itself stays plain."
              >
                <button onClick={() => void removePin()} className={BUTTON}>
                  Remove lock
                </button>
              </Row>
              <Row title="Re-lock after" hint="Minutes of no mouse or keyboard input.">
                <input
                  type="number"
                  min={1}
                  value={idleMinutes}
                  onChange={(e) => void saveIdleMinutes(Number(e.target.value) || 1)}
                  className="w-16 rounded-md border border-border bg-bg px-2 py-1.5 text-center text-[14px] outline-none focus:border-accent"
                />
              </Row>
            </>
          ) : (
            <div className="py-3">
              <div className="mb-3 text-[15px]">Set a PIN</div>
              <div className="mb-0.5 text-center text-[12px] uppercase tracking-wider text-faint">
                New PIN
              </div>
              <PinInput value={newPin} onChange={setNewPin} />
              <div className="mb-0.5 mt-3 text-center text-[12px] uppercase tracking-wider text-faint">
                Confirm
              </div>
              <PinInput
                value={confirmPin}
                onChange={setConfirmPin}
                onComplete={() => void savePin()}
              />
            </div>
          )}
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
