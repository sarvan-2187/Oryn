import { useCallback, useEffect, useRef, useState } from 'react'
import { PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'

const FOCUS_MINUTES = 25
const BREAK_MINUTES = 5

type Phase = 'focus' | 'break'

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface Props {
  onLogged?: () => void
}

/**
 * A focus timer that logs finished sessions.
 *
 * Time is tracked against a wall-clock deadline rather than by counting ticks,
 * so the count stays honest when the machine sleeps or the tab is throttled.
 * Only completed focus blocks are logged, so the heatmap records real work
 * rather than timers that were started and abandoned.
 */
export function Pomodoro({ onLogged }: Props): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('focus')
  const [running, setRunning] = useState(false)
  const [remaining, setRemaining] = useState(FOCUS_MINUTES * 60)
  const [doneToday, setDoneToday] = useState(0)
  const deadline = useRef<number | null>(null)

  const loadMinutes = useCallback(async () => {
    setDoneToday(await window.oryn.focus.minutes())
  }, [])

  useEffect(() => {
    void loadMinutes()
  }, [loadMinutes])

  const finish = useCallback(
    async (completed: Phase) => {
      setRunning(false)
      deadline.current = null
      if (completed === 'focus') {
        await window.oryn.focus.log(FOCUS_MINUTES)
        await loadMinutes()
        onLogged?.()
        setPhase('break')
        setRemaining(BREAK_MINUTES * 60)
      } else {
        setPhase('focus')
        setRemaining(FOCUS_MINUTES * 60)
      }
    },
    [loadMinutes, onLogged]
  )

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      if (deadline.current == null) return
      const left = Math.round((deadline.current - Date.now()) / 1000)
      if (left <= 0) void finish(phase)
      else setRemaining(left)
    }, 500)
    return () => clearInterval(id)
  }, [running, phase, finish])

  const toggle = (): void => {
    if (running) {
      setRunning(false)
      deadline.current = null
      return
    }
    deadline.current = Date.now() + remaining * 1000
    setRunning(true)
  }

  const reset = (): void => {
    setRunning(false)
    deadline.current = null
    setRemaining((phase === 'focus' ? FOCUS_MINUTES : BREAK_MINUTES) * 60)
  }

  const total = (phase === 'focus' ? FOCUS_MINUTES : BREAK_MINUTES) * 60
  const progress = 1 - remaining / total

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="font-mono text-[24px] tabular-nums leading-none">{mmss(remaining)}</div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-[13px]">
          <span className={phase === 'focus' ? 'text-text' : 'text-success'}>
            {phase === 'focus' ? 'Focus' : 'Break'}
          </span>
          <span className="text-faint">{doneToday} min today</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, progress * 100))}%`,
              background: phase === 'focus' ? 'var(--color-accent)' : 'var(--color-success)'
            }}
          />
        </div>
      </div>

      <button
        onClick={toggle}
        aria-label={running ? 'Pause timer' : 'Start timer'}
        title={running ? 'Pause' : 'Start'}
        className="grid size-8 place-items-center rounded-md border border-border text-muted hover:border-accent hover:text-text"
      >
        {running ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
      </button>
      <button
        onClick={reset}
        aria-label="Reset timer"
        title="Reset"
        className="grid size-8 place-items-center rounded-md border border-border text-muted hover:border-accent hover:text-text"
      >
        <RotateCcwIcon className="size-4" />
      </button>
    </div>
  )
}
