# Arca: design

A self-hosted, multi-user file backup and sharing app. Domain terms are defined in [`GLOSSARY.md`](../GLOSSARY.md); load-bearing decisions are in [`docs/adr/`](adr/).

## Scope (v1)

| Area     | v1                                                                                                                                                                        | Later                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Accounts | Admin + Members, 7-day one-time Invites, disable then purge, no quotas                                                                                                    | Passkeys                          |
| Auth     | Email + password, optional TOTP 2FA (Better Auth)                                                                                                                         |                                   |
| Library  | Folder tree, collision prompt (replace / keep both / skip, "apply to all"), auto-rename on folder upload, move/rename                                                     |                                   |
| Tags     | Per-Owner, flat, colored, on Files only                                                                                                                                   |                                   |
| Trash    | One entry per deleted File/subtree, restore recreates path, 30-day purge, empty / delete forever                                                                          |                                   |
| Dedup    | Invisible global Blob dedup; Owner-only Duplicate notice with "Discard this copy"                                                                                         |                                   |
| Uploads  | tus, 50 MB chunks, about 10 GB files, folder drag-and-drop, queue with pause/cancel, resume after reload                                                                  |                                   |
| Viewing  | Grid/list, image thumbnails, previews (image, video/audio with range requests, PDF, text), streamed zip download                                                          | Video poster frames (ffmpeg)      |
| Search   | Query language (`tag:` `type:` `in:` `before:` `after:`), filter chips, `pg_trgm` typo-tolerant names, whole library by default, Trash excluded, ⌘K palette               | Full-text search inside documents |
| Sharing  | File/Folder links (live), optional password (argon2, rate-limited), expiry, download limit, Shared view with counts + last access, no IP logging, disabled while in Trash | File-request upload links         |
| Client   | Responsive web; light / dark / system                                                                                                                                     | PWA + share target                |

## Modules

Each module is **deep**: a small interface hiding most of the behaviour. Nuxt `server/api/*` routes are **thin adapters**: parse the request, call one module, shape the response. Domain errors are mapped to HTTP status codes once, in `defineApiHandler` (`server/utils/api.ts`).

| Module                 | Interface (rough)                                                           | Hides                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Library**            | `library.for(user)` → folders, files, tags, move / rename / trash / restore | tree integrity, Name collision rules, Trash subtrees, path recreation, Blob ref-counting                                 |
| **Ingest**             | tus endpoint → a finished File in a Folder                                  | chunk staging, streaming SHA-256, Blob dedup, re-applying the collision decision at completion, abandoned-Upload cleanup |
| **BlobStore** _(seam)_ | `put(stream) → hash`, `get(hash, range?)`, `delete(hash)`                   | on-disk layout `ab/cd/<hash>`; an S3/R2 adapter later                                                                    |
| **Shares**             | `create`, `revoke`, `resolve(token, password?) → grant`                     | token generation, argon2, expiry, download limits, rate limits, counters                                                 |
| **Search**             | `search(user, query) → results`                                             | query parsing, `pg_trgm` + tag SQL, ranking                                                                              |
| **Previews**           | `enqueue(fileId)`, `get(fileId, size)`                                      | sharp, job queue, ffmpeg (later)                                                                                         |
| **Auth**               | `requireUser(event)`, `requireAdmin(event)`                                 | Better Auth config, sessions, TOTP, Invites                                                                              |

BlobStore is the only seam with two adapters in sight (local disk now, S3/R2 later). The others are deep modules with no swappable seam; don't add one until a second adapter actually exists.

### Collision vs Duplicate timing

- **Name collision** is checked _before_ any bytes are sent. The client asks, the user decides, and the decision travels as tus metadata. Ingest re-applies it at completion if a same-named sibling appeared during the upload.
- **Duplicate** can only be known _after_ the server-side hash exists. It shows as a non-blocking notice with "Discard this copy".

### Background jobs (pg-boss)

- Generate Previews after an Upload completes
- Purge Trash entries older than 30 days
- Delete Uploads with no progress for 24 h
- Nightly GC of Blobs with zero references
- Nightly `pg_dump` into the data volume

## Stack

- **Nuxt** (Nitro `node-server` preset), **Postgres** + **Drizzle**, **pg-boss**, **Better Auth**, `@tus/server` / `tus-js-client`, **sharp**
- **bun** for installs/scripts; **Node** runtime; **Vitest** (ADR-0004)
- **Reka UI** (headless) with a custom, calm style inspired by PrimeVue Aura: soft surfaces, generous radii, subtle borders, one accent colour
- ESLint (`@nuxt/eslint`) + Prettier

## Testing (local only)

- Vitest module tests through each module's interface, against **PGlite**, plus one pass against real Postgres
- BlobStore is tested on a temporary directory
- No mocking of the database or file system inside modules
- Playwright smoke tests: log in → upload a large file with an interrupted resume → share it → open the link logged out

## Deployment

- `docker compose`: `app`, `postgres`, `cloudflared`; volumes `pgdata` and `blobs`
- The nightly `pg_dump` lands next to the blobs, so one restic/Borg/rsync job can ship a single directory off-site (recipe in the README)
- ⚠️ Cloudflare's terms have historically discouraged using their proxy mostly for large binary/media transfer. That's acceptable at personal scale, but it's a known risk.

## Milestones

1. **Skeleton**: Nuxt + Postgres + Drizzle + compose, Better Auth login + TOTP, admin Invites, theming
2. **Library + BlobStore + Ingest**: folders, resumable uploads, collisions, dedup, range downloads
3. **Browsing**: grid/list, thumbnails, previews, zip download, moving items
4. **Tags + Search**: tags, query language, filter chips, ⌘K
5. **Trash**: subtree trash, restore, 30-day purge, Blob GC
6. **Shares**: links, password, expiry, limits, Shared view
7. **Ops**: backups, cloudflared, README, Playwright smoke tests
