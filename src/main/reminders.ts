import { Notification } from 'electron'
import { today } from '../shared/dates'
import { buildReminderSummary } from './db/queries/reminders'
import { getSetting, setSetting } from './db/queries/settings'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // hourly
const LAST_NOTIFIED_KEY = 'reminders.lastNotifiedDate'

function buildMessage(summary: ReturnType<typeof buildReminderSummary>): string | null {
  const parts: string[] = []
  if (summary.dueTaskCount > 0) {
    parts.push(`${summary.dueTaskCount} task${summary.dueTaskCount === 1 ? '' : 's'} due today`)
  }
  for (const h of summary.atRiskHabits) {
    parts.push(`${h.name} streak (${h.streak}d) needs today's check-in`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Fires at most once per calendar day — gated by a settings row, not by only
 * calling this once, since it's re-invoked hourly to catch a day that started
 * with nothing due yet (e.g. the app launched at midnight and a task's due
 * date is today).
 */
function checkAndNotify(onClick: () => void): void {
  if (!Notification.isSupported()) return
  const day = today()
  if (getSetting(LAST_NOTIFIED_KEY) === day) return

  const message = buildMessage(buildReminderSummary(day))
  if (!message) return

  const notification = new Notification({ title: 'Oryn', body: message })
  notification.on('click', onClick)
  notification.show()
  setSetting(LAST_NOTIFIED_KEY, day)
}

/**
 * Checks once immediately, then hourly. Returns a stop function so the
 * interval can be cleared on app quit.
 */
export function startReminders(onClick: () => void): () => void {
  checkAndNotify(onClick)
  const timer = setInterval(() => checkAndNotify(onClick), CHECK_INTERVAL_MS)
  return () => clearInterval(timer)
}
