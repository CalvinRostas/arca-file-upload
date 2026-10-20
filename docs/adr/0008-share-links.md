# ADR-0008: Share links keep their token, remember passwords in signed cookies, and turn previews off under a download limit

**Status:** Accepted · 2026-10-20

## Context

A Share link hands part of an Owner's Library to whoever holds the token (GLOSSARY: Share link). Three questions came up while building it that later changes could easily undo without noticing.

1. Invites store only a hash of their token, because the token is shown once. Owners expect to copy a Share link again from the Shared view, weeks later.
2. A password-protected link has to stay unlocked across many requests: listings, thumbnails as `<img src>`, video range requests, zips. None of them can carry a header the page adds.
3. A download limit is meant to cap how often the bytes leave. A preview in the browser (image, video, PDF, text) sends the same bytes as a download.

## Decision

1. **The token is stored as is** (128 random bits, base64url), unique, next to the Share. A database leak exposes the links. It also exposes everything else the links lead to, so hashing them wouldn't protect much.
2. **A typed password becomes a Pass**: `expiry.HMAC(secret, shareId.passwordHash.expiry)`, in an httpOnly, SameSite=Lax cookie per link, valid for 24 h. Because the MAC covers the password hash, changing or removing the password invalidates every Pass at once, with no session table. Wrong passwords are limited per link (10 per 15 minutes, in memory), not per IP, because Arca keeps no visitor IPs.
3. **While a link has a download limit, previews are off.** Visitors get thumbnails and a Download button. Every download counts once, checked atomically (`downloads < max_downloads` in the `UPDATE`); resumed ranges don't count. A zip counts as one.

What a link reaches is answered by the Library (`library.for(owner).within(itemId)`). Items are checked by walking _up_ from the requested Item to the shared one, so moving something out of a shared Folder, or trashing it, takes it out of reach at once.

## Consequences

- Don't add a preview path for Share links (a larger rendition, an inline `content` URL) that skips the `previews` check in `sharedFileOptions`, or the limit stops meaning anything.
- The per-link limiter lets a stranger lock the real visitor out of a password-protected link for up to 15 minutes. That's acceptable at personal scale. It also resets on restart.
- Rotating `NUXT_AUTH_SECRET` signs everyone out and invalidates every Pass, which is the same as it does for sessions.
