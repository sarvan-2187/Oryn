import { useRef } from 'react'

const LENGTH = 4

/** Four boxes, one digit each, auto-advancing — the familiar iOS passcode style. */
export function PinInput({
  value,
  onChange,
  onComplete,
  autoFocus
}: {
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  autoFocus?: boolean
}): React.JSX.Element {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const setDigit = (i: number, raw: string): void => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const chars = value.padEnd(LENGTH, ' ').split('')
    chars[i] = digit || ' '
    const next = chars.join('').replace(/ +$/, '')
    onChange(next)
    if (digit && i < LENGTH - 1) refs.current[i + 1]?.focus()
    if (digit && next.length === LENGTH) onComplete?.(next)
  }

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus()
  }

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length: LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          autoFocus={autoFocus && i === 0}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          className="size-12 rounded-md border border-border bg-surface text-center text-[22px] outline-none focus:border-accent"
        />
      ))}
    </div>
  )
}
