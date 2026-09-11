import { useEffect, useRef, useState } from 'react'
import { ExternalLinkIcon, PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'
import type { PomodoroState } from '../../../shared/types'

// ponytail: duplicated from src/main/pomodoro.ts's FOCUS_MINUTES/BREAK_MINUTES
// (only used here to size the progress bar) — keep the two in sync if either
// changes. A shared constants module would be the fix if this ever drifts.
const FOCUS_MINUTES = 25
const BREAK_MINUTES = 5

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface Props {
  onLogged?: () => void
}

/**
 * A thin view over the main process's timer (src/main/pomodoro.ts) — the
 * timer itself lives there so every window (dashboard, mini popup) shows the
 * exact same running clock instead of each owning an independent one that
 * could drift out of sync.
 */
export function Pomodoro({ onLogged }: Props): React.JSX.Element {
  const [state, setState] = useState<PomodoroState>({
    phase: 'focus',
    running: false,
    remaining: FOCUS_MINUTES * 60
  })
  const [doneToday, setDoneToday] = useState(0)
  const prevPhase = useRef(state.phase)

  useEffect(() => {
    const loadMinutes = async (): Promise<void> => {
      setDoneToday(await window.oryn.focus.minutes())
    }
    void window.oryn.pomodoro.state().then(setState)
    void loadMinutes()
    return window.oryn.pomodoro.onTick((next) => {
      if (prevPhase.current === 'focus' && next.phase === 'break') {
        void loadMinutes()
        onLogged?.()
      }
      prevPhase.current = next.phase
      setState(next)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = (state.phase === 'focus' ? FOCUS_MINUTES : BREAK_MINUTES) * 60
  const progress = 1 - state.remaining / total

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="font-mono text-[24px] tabular-nums leading-none">{mmss(state.remaining)}</div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-[13px]">
          <span className={state.phase === 'focus' ? 'text-text' : 'text-success'}>
            {state.phase === 'focus' ? 'Focus' : 'Break'}
          </span>
          <span className="text-faint">{doneToday} min today</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, progress * 100))}%`,
              background: state.phase === 'focus' ? 'var(--color-accent)' : 'var(--color-success)'
            }}
          />
        </div>
      </div>

      <button
        onClick={() => void window.oryn.pomodoro.toggle().then(setState)}
        aria-label={state.running ? 'Pause timer' : 'Start timer'}
        title={state.running ? 'Pause' : 'Start'}
        className="grid size-8 place-items-center rounded-md border border-border text-muted hover:border-accent hover:text-text"
      >
        {state.running ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
      </button>
      <button
        onClick={() => void window.oryn.pomodoro.reset().then(setState)}
        aria-label="Reset timer"
        title="Reset"
        className="grid size-8 place-items-center rounded-md border border-border text-muted hover:border-accent hover:text-text"
      >
        <RotateCcwIcon className="size-4" />
      </button>
      <button
        onClick={() => void window.oryn.pomodoro.openMini()}
        aria-label="Open floating timer"
        title="Open floating timer"
        className="grid size-8 place-items-center rounded-md border border-border text-muted hover:border-accent hover:text-text"
      >
        <ExternalLinkIcon className="size-4" />
      </button>
    </div>
  )
}
