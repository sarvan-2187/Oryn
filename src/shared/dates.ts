/** Local-calendar date helpers. Dates are plain YYYY-MM-DD strings everywhere. */

export function toDateStr(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function today(): string {
  return toDateStr(new Date())
}

/** Parses YYYY-MM-DD as a local date, avoiding the UTC shift of `new Date(str)`. */
export function fromDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s: string, n: number): string {
  const d = fromDateStr(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

/** Whole days from `a` to `b`; negative when `b` is in the past. */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromDateStr(b).getTime() - fromDateStr(a).getTime()) / 86_400_000)
}

/**
 * The next occurrence after `date` for a recurrence rule.
 * Monthly clamps to the last valid day, so the 31st recurs on the 30th, the
 * 28th, and so on rather than rolling into the following month.
 */
export function nextOccurrence(
  date: string,
  rule: 'daily' | 'weekdays' | 'weekly' | 'monthly'
): string {
  if (rule === 'daily') return addDays(date, 1)
  if (rule === 'weekly') return addDays(date, 7)
  if (rule === 'weekdays') {
    let next = addDays(date, 1)
    while ([0, 6].includes(fromDateStr(next).getDay())) next = addDays(next, 1)
    return next
  }
  const d = fromDateStr(date)
  const day = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  return toDateStr(target)
}
