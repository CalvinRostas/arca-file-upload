import type { H3Event } from 'h3'
import { Forbidden } from '../modules/errors'
import type { Grant } from '../modules/shares'

/** Where a visitor's typed password is remembered, per link. */
export const passCookie = (token: string) => `arca_share_${token}`

/**
 * The Share link in the route (`[token]`), checked: what it grants, and the read-only part
 * of the Owner's Library it reaches. Fails like the link does (gone, expired, password, …).
 */
export async function useSharedAccess(event: H3Event) {
  const { shares, library } = await useArca()
  const token = getRouterParam(event, 'token')!
  const grant = await shares.resolve(token, getCookie(event, passCookie(token)))
  return { grant, items: library.for({ id: grant.ownerId }).within(grant.itemId) }
}

/** Downloads count against the link's limit; previews are only allowed without one. */
export async function sharedFileOptions(event: H3Event, grant: Grant) {
  const { shares } = await useArca()
  const preview = getQuery(event).inline === '1'
  if (preview && !grant.previews) throw new Forbidden('Previews are off for this link')
  return { preview, onDownload: () => shares.recordDownload(grant) }
}
