import { today } from '../../../shared/dates'
import { listTasks } from './tasks'
import { habitsForDate, habitStats } from './habits'

// ponytail: fixed threshold, not a user setting — add a Settings control if
// 3 days turns out to be the wrong number for how this actually gets used.
const AT_RISK_STREAK_THRESHOLD = 3

export interface ReminderSummary {
  dueTaskCount: number
  atRiskHabits: { id: number; name: string; streak: number }[]
}

/**
 * What's worth a nudge today: undone tasks due today (or overdue — `listTasks`'s
 * `today` scope already includes those), and habits with an unbroken streak of
 * at least AT_RISK_STREAK_THRESHOLD days that haven't been checked off yet today.
 * `habitStats` already computes "streak as of yesterday" whenever today isn't
 * done yet, so no separate date math is needed here.
 */
export function buildReminderSummary(date?: string, spaceId?: number | null): ReminderSummary {
  const day = date ?? today()

  const dueTaskCount = listTasks({ spaceId, scope: 'today', date: day }).filter(
    (t) => t.status !== 'done'
  ).length

  const atRiskHabits = habitsForDate(day, spaceId)
    .filter((h) => !h.done)
    .map((h) => ({ id: h.id, name: h.name, streak: habitStats(h.id, day).current_streak }))
    .filter((h) => h.streak >= AT_RISK_STREAK_THRESHOLD)

  return { dueTaskCount, atRiskHabits }
}
