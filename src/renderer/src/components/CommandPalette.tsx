import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { useStore, type View } from '../store'
import type { GlobalSearchResult } from '../../../shared/types'

const GROUP_HEADING =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[13px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint'

interface Action {
  id: string
  label: string
  run: () => void
}

export function CommandPalette(): React.JSX.Element | null {
  const {
    paletteOpen,
    setPalette,
    spaces,
    setSpace,
    setView,
    setNote,
    toggleTheme,
    activeSpaceId,
    setFocusTaskId,
    setFocusHabitId
  } = useStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult>({
    notes: [],
    tasks: [],
    habits: [],
    journal: []
  })

  // Search runs in the main process, so cmdk's own filtering stays off and
  // the action list is filtered here against the same query.
  useEffect(() => {
    if (!paletteOpen) return
    let cancelled = false
    const run = async (): Promise<void> => {
      const q = query.trim()
      if (!q) {
        const rows = await window.oryn.notes.list({ spaceId: null })
        if (!cancelled) setResults({ notes: rows.slice(0, 20), tasks: [], habits: [], journal: [] })
        return
      }
      const r = await window.oryn.search.global(q, activeSpaceId)
      if (!cancelled) setResults(r)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [query, paletteOpen, activeSpaceId])

  useEffect(() => {
    if (!paletteOpen) setQuery('')
  }, [paletteOpen])

  const close = (): void => setPalette(false)

  const openNote = (id: number): void => {
    setView('notes')
    setNote(id)
    close()
  }

  const openTask = (id: number): void => {
    setView('tasks')
    setFocusTaskId(id)
    close()
  }

  const openHabit = (id: number): void => {
    setView('habits')
    setFocusHabitId(id)
    close()
  }

  // Journal is date-keyed with no per-date browsing view (Dashboard only ever
  // shows today's entry), so the best this can do is land on Dashboard —
  // it'll only actually show the match if the entry is today's.
  const openJournal = (): void => {
    setView('dashboard')
    close()
  }

  const actions = useMemo<Action[]>(() => {
    const go = (view: View, label: string): Action => ({
      id: `view-${view}`,
      label,
      run: () => {
        setView(view)
        close()
      }
    })
    return [
      {
        id: 'new-note',
        label: 'New note',
        run: () => {
          const target = activeSpaceId ?? spaces.find((s) => !s.is_system)?.id
          if (target == null) return
          void window.oryn.notes.create({ spaceId: target }).then((n) => openNote(n.id))
        }
      },
      go('dashboard', 'Go to Today'),
      go('notes', 'Go to Notes'),
      go('tasks', 'Go to Tasks'),
      go('habits', 'Go to Habits'),
      go('archive', 'Go to Archive'),
      ...spaces
        .filter((s) => !s.is_system)
        .map((s) => ({
          id: `space-${s.id}`,
          label: `Switch to ${s.name}`,
          run: () => {
            setSpace(s.id)
            close()
          }
        })),
      {
        id: 'theme',
        label: 'Toggle theme',
        run: () => {
          toggleTheme()
          close()
        }
      }
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaces, activeSpaceId])

  const visibleActions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter((a) => a.label.toLowerCase().includes(q))
  }, [actions, query])

  if (!paletteOpen) return null

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
            placeholder="Search everything or run a command…"
            className="w-full border-b border-border bg-transparent px-4 py-3 text-[17px] outline-none placeholder:text-faint"
          />
          <Command.List className="max-h-[340px] overflow-y-auto p-2">
            {visibleActions.length === 0 &&
              results.notes.length === 0 &&
              results.tasks.length === 0 &&
              results.habits.length === 0 &&
              results.journal.length === 0 && (
                <div className="px-3 py-6 text-center text-[16px] text-faint">Nothing found.</div>
              )}

            {visibleActions.length > 0 && (
              <Command.Group heading="Actions" className={GROUP_HEADING}>
                {visibleActions.map((a) => (
                  <Item key={a.id} value={a.id} onSelect={a.run}>
                    {a.label}
                  </Item>
                ))}
              </Command.Group>
            )}

            {results.notes.length > 0 && (
              <Command.Group heading="Notes" className={GROUP_HEADING}>
                {results.notes.map((n) => (
                  <Item key={n.id} value={`note-${n.id}`} onSelect={() => openNote(n.id)}>
                    <span className="truncate">{n.title || 'Untitled'}</span>
                    <span className="ml-2 truncate text-[15px] text-faint">{n.excerpt}</span>
                  </Item>
                ))}
              </Command.Group>
            )}

            {results.tasks.length > 0 && (
              <Command.Group heading="Tasks" className={GROUP_HEADING}>
                {results.tasks.map((t) => (
                  <Item key={t.id} value={`task-${t.id}`} onSelect={() => openTask(t.id)}>
                    <span className="truncate">{t.title}</span>
                    {t.due_date && (
                      <span className="ml-2 truncate text-[15px] text-faint">{t.due_date}</span>
                    )}
                  </Item>
                ))}
              </Command.Group>
            )}

            {results.habits.length > 0 && (
              <Command.Group heading="Habits" className={GROUP_HEADING}>
                {results.habits.map((h) => (
                  <Item key={h.id} value={`habit-${h.id}`} onSelect={() => openHabit(h.id)}>
                    <span className="truncate">{h.name}</span>
                  </Item>
                ))}
              </Command.Group>
            )}

            {results.journal.length > 0 && (
              <Command.Group heading="Journal" className={GROUP_HEADING}>
                {results.journal.map((j) => (
                  <Item key={j.date} value={`journal-${j.date}`} onSelect={openJournal}>
                    <span className="truncate">{j.date}</span>
                    <span className="ml-2 truncate text-[15px] text-faint">{j.excerpt}</span>
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
  value,
  onSelect
}: {
  children: React.ReactNode
  value: string
  onSelect: () => void
}): React.JSX.Element {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center rounded-md px-3 py-2 text-[16px] data-[selected=true]:bg-surface-2"
    >
      {children}
    </Command.Item>
  )
}
