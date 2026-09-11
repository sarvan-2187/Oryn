import { useEffect } from 'react'
import { useStore } from '../store'

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click'] as const

/**
 * Re-locks the app after getIdleMinutes() of no mouse/keyboard input — but
 * only once a PIN is actually set; otherwise there's nothing to lock back
 * behind. Renders nothing; it's a side-effect-only component so App.tsx can
 * mount it declaratively alongside ConfirmDialog.
 */
export function IdleLockWatcher(): null {
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let armed = false
    let cancelled = false

    const resetTimer = async (): Promise<void> => {
      if (!armed || cancelled) return
      if (idleTimer) clearTimeout(idleTimer)
      const minutes = await window.oryn.lock.getIdleMinutes()
      if (cancelled) return
      idleTimer = setTimeout(() => useStore.getState().setLocked(true), minutes * 60_000)
    }

    const onActivity = (): void => {
      void resetTimer()
    }

    void window.oryn.lock.isSet().then((set) => {
      if (cancelled || !set) return
      armed = true
      void resetTimer()
    })

    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity)

    return () => {
      cancelled = true
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity)
      if (idleTimer) clearTimeout(idleTimer)
    }
  }, [])

  return null
}
