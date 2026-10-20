import type { ShareLink } from '~/types/library'

/** The public URL of a Share link. */
export function shareUrl(token: string): string {
  return `${useRequestURL().origin}/s/${token}`
}

export const shareStatusLabel: Record<ShareLink['status'], string> = {
  active: 'Active',
  expired: 'Expired',
  'used-up': 'Download limit reached',
  trashed: 'In Trash, link paused',
}

/** "Password · Until 27 Oct 2026 · 2 of 5 downloads" */
export function shareSettingsLabel(link: ShareLink): string {
  const parts: string[] = []
  if (link.hasPassword) parts.push('Password')
  if (link.expiresAt && link.status !== 'expired') parts.push(`Until ${formatDate(link.expiresAt)}`)
  if (link.maxDownloads !== null) parts.push(`${link.downloads} of ${link.maxDownloads} downloads`)
  return parts.length ? parts.join(' · ') : 'Anyone with the link'
}

/** "Opened 3 times · 1 download · last 2 hours ago", or "Not opened yet". */
export function shareActivityLabel(link: ShareLink): string {
  if (!link.lastAccessedAt) return 'Not opened yet'
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
  const parts: string[] = []
  if (link.views > 0) parts.push(`Opened ${link.views === 1 ? 'once' : `${link.views} times`}`)
  if (link.maxDownloads === null) parts.push(plural(link.downloads, 'download'))
  parts.push(`last ${formatFromNow(link.lastAccessedAt)}`)
  return parts.join(' · ')
}
