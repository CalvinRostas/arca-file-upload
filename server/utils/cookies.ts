import type { H3Event } from 'h3'

/** Forward the session cookies an Auth sign-in produced onto the response. */
export function forwardSetCookies(event: H3Event, headers: Headers): void {
  for (const cookie of headers.getSetCookie()) appendResponseHeader(event, 'set-cookie', cookie)
}
