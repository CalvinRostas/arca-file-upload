const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function formatDate(value: string | Date): string {
  return dateFormat.format(new Date(value))
}

/** "in 6 days", "in 3 hours", "5 minutes ago", "just now" — for expiries and recent events. */
export function formatFromNow(value: string | Date): string {
  const ms = new Date(value).getTime() - Date.now()
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const minutes = Math.round(ms / 60_000)
  if (Math.abs(minutes) < 1) return 'just now'
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute')
  const hours = Math.round(ms / 3_600_000)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  return rtf.format(Math.round(hours / 24), 'day')
}

/** 1536 → "1.5 KB". Decimal units, like Finder. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = -1
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/** "about 4 min left" from bytes remaining and bytes/second. */
export function formatEta(remaining: number, bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return ''
  const seconds = remaining / bytesPerSecond
  if (seconds < 60) return 'less than a minute left'
  if (seconds < 3600) return `about ${Math.round(seconds / 60)} min left`
  return `about ${(seconds / 3600).toFixed(1)} h left`
}
