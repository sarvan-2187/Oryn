import { useState } from 'react'
import { useStore } from '../store'

export function LockScreen(): React.JSX.Element {
  const setLocked = useStore((s) => s.setLocked)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    const ok = await window.oryn.lock.verify(pin)
    if (ok) {
      setLocked(false)
      setPin('')
      setError(null)
    } else {
      setError('Wrong PIN.')
      setPin('')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-1 items-center justify-center bg-bg">
      <div className="w-[280px]">
        <h1 className="mb-4 text-center text-[18px] font-medium text-text">Oryn is locked</h1>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="Enter PIN"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-center text-[18px] tracking-widest outline-none focus:border-accent"
        />
        {error && <p className="mt-2 text-center text-[13px] text-danger">{error}</p>}
        <button
          onClick={() => void submit()}
          className="mt-3 w-full rounded-md border border-accent bg-accent/15 py-2 text-[15px] text-accent"
        >
          Unlock
        </button>
      </div>
    </div>
  )
}
