import { create } from 'zustand'

interface ConfirmState {
  open: boolean
  message: string
  danger: boolean
  resolve: ((v: boolean) => void) | null
}

const useConfirmStore = create<ConfirmState>(() => ({
  open: false,
  message: '',
  danger: false,
  resolve: null
}))

/**
 * Themed replacement for `window.confirm`. Electron's native confirm is
 * OS-chrome and can't be restyled, so this renders in-app instead — same
 * call shape, just async since it's a real component under the hood.
 */
export function confirmDialog(message: string, opts?: { danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({ open: true, message, danger: opts?.danger ?? true, resolve })
  })
}

/** Mounted once in App.tsx; renders nothing until confirmDialog() is called. */
export function ConfirmDialog(): React.JSX.Element | null {
  const { open, message, danger, resolve } = useConfirmStore()
  if (!open) return null

  const close = (result: boolean): void => {
    useConfirmStore.setState({ open: false, resolve: null })
    resolve?.(result)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => close(false)}
    >
      <div
        className="w-[380px] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-4 text-[16px] text-text">{message}</div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            autoFocus
            onClick={() => close(false)}
            className="rounded border border-border px-3 py-1.5 text-[14px] text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={() => close(true)}
            className={`rounded border px-3 py-1.5 text-[14px] ${
              danger
                ? 'border-danger bg-danger/15 text-danger'
                : 'border-accent bg-accent/15 text-accent'
            }`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
