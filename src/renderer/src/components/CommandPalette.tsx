import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useStore } from '../store'
import type { NoteSummary } from '../../../shared/types'

export function CommandPalette(): React.JSX.Element | null {
  const { paletteOpen, setPalette, spaces, setSpace, setView, setNote, toggleTheme, activeSpaceId } =
    useStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NoteSummary[]>([])

  // Search runs in the main process, so cmdk's own filtering is turned off.
  useEffect(() => {
    if (!paletteOpen) return
    let cancelled = false
    const run = async (): Promise<void> => {
      const rows = query.trim()
        ? await window.oryn.notes.search(query, null)
        : await window.oryn.notes.list({ spaceId: null })
      if (!cancelled) setResults(rows.slice(0, 20))
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [query, paletteOpen])

  useEffect(() => {
    if (!paletteOpen) setQuery('')
  }, [paletteOpen])

  if (!paletteOpen) return null

  const close = (): void => setPalette(false)

  const openNote = (id: number): void => {
    setView('notes')
    setNote(id)
    close()
  }

  const newNote = async (): Promise<void> => {
    const target = activeSpaceId ?? spaces.find((s) => !s.is_system)?.id
    if (target == null) return
    const created = await window.oryn.notes.create({ spaceId: target })
    openNote(created.id)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]"
      onClick={close}
    >
      <div
        className="w-[560px] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} loop>
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search notes or run a command…"
            className="w-full border-b border-border bg-transparent px-4 py-3 text-[14px] outline-none placeholder:text-faint"
          />
          <Command.List className="max-h-[340px] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-[13px] text-faint">
              Nothing found.
            </Command.Empty>

            <Command.Group
              heading="Actions"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint"
            >
              <Item onSelect={() => void newNote()}>New note</Item>
              <Item
                onSelect={() => {
                  toggleTheme()
                  close()
                }}
              >
                Toggle theme
              </Item>
              <Item
                onSelect={() => {
                  setSpace(null)
                  setView('notes')
                  close()
                }}
              >
                Go to all notes
              </Item>
              <Item
                onSelect={() => {
                  setView('archive')
                  close()
                }}
              >
                Go to archive
              </Item>
              {spaces
                .filter((s) => !s.is_system)
                .map((s) => (
                  <Item
                    key={`space-${s.id}`}
                    onSelect={() => {
                      setSpace(s.id)
                      setView('notes')
                      close()
                    }}
                  >
                    Switch to {s.name}
                  </Item>
                ))}
            </Command.Group>

            {results.length > 0 && (
              <Command.Group
                heading="Notes"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint"
              >
                {results.map((n) => (
                  <Item key={n.id} onSelect={() => openNote(n.id)}>
                    <span className="truncate">{n.title || 'Untitled'}</span>
                    <span className="ml-2 truncate text-[12px] text-faint">{n.excerpt}</span>
                  </Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}

function Item({
  children,
  onSelect
}: {
  children: React.ReactNode
  onSelect: () => void
}): React.JSX.Element {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center rounded-md px-3 py-2 text-[13px] data-[selected=true]:bg-surface-2"
    >
      {children}
    </Command.Item>
  )
}
