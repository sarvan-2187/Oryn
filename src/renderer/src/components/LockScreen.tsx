import { useState } from 'react'
import { useStore } from '../store'
import { PinInput } from './PinInput'

export function LockScreen(): React.JSX.Element {
  const setLocked = useStore((s) => s.setLocked)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (candidate: string): Promise<void> => {
    const ok = await window.oryn.lock.verify(candidate)
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
        <PinInput
          autoFocus
          value={pin}
          onChange={(v) => {
            setPin(v)
            setError(null)
          }}
          onComplete={(v) => void submit(v)}
        />
        {error && <p className="mt-3 text-center text-[13px] text-danger">{error}</p>}
      </div>
    </div>
  )
}
