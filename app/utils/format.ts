const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function formatDate(value: string | Date): string {
  return dateFormat.format(new Date(value))
}

/** "in 6 days", "in 3 hours" — for expiries. */
export function formatFromNow(value: string | Date): string {
  const ms = new Date(value).getTime() - Date.now()
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const hours = Math.round(ms / 3_600_000)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  return rtf.format(Math.round(hours / 24), 'day')
}
