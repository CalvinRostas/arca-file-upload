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

| Module                 | Interface (rough)                                                                                                                | Hides                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Library**            | `library.for(user)` → folders, files, move / rename / trash / restore; housekeeping `purgeExpiredTrash()`, `collectBlobs(sweep)` | tree integrity, Name collision rules, Trash subtrees, path recreation, Blob ref-counting and GC locking (ADR-0007)                                |
| **Ingest**             | tus endpoint → a finished File in a Folder                                                                                       | chunk staging, streaming SHA-256, Blob dedup, re-applying the collision decision at completion, abandoned-Upload cleanup                          |
| **BlobStore** _(seam)_ | `adopt(tempFile, hash)`, `open(hash, range?)`, `has`, `delete`                                                                   | on-disk layout `ab/cd/<hash>`, atomic moves; an S3/R2 adapter later. `adopt` (not `put(stream)`) because tus has already staged the bytes on disk |
| **Shares**             | `shares.for(user)` → `create` / `update` / `revoke` / `list`; `resolve(token, pass?) → grant`, `unlock`, `recordDownload`        | token generation, argon2, signed Passes, expiry, download limits, per-link rate limits, counters; reach via `library.within(itemId)` (ADR-0008)   |
| **Search**             | `search(user, query) → results`                                                                                                  | query parsing, `pg_trgm` + tag SQL, ranking                                                                                                       |
| **Previews**           | `request(blobHash, mimeType)`, `thumbnailPath(blobHash)`, `backfill()`                                                           | sharp, per-Blob WebP thumbnails (identical bytes share one), the Jobs queue, ffmpeg (later)                                                       |
| **Jobs**               | `register`, `enqueue(kind, payload, {runAt, dedupeKey})`, `every(kind, ms)`                                                      | `job` table, SKIP LOCKED claims, leases, backoff, failure bookkeeping (ADR-0006)                                                                  |
| **Auth**               | `requireUser(event)`, `requireAdmin(event)`                                                                                      | Better Auth config, sessions, TOTP, Invites                                                                                                       |

BlobStore is the only seam with two adapters in sight (local disk now, S3/R2 later). The others are deep modules with no swappable seam; don't add one until a second adapter actually exists.

### Collision vs Duplicate timing

- **Name collision** is checked _before_ any bytes are sent. The client asks, the user decides, and the decision travels as tus metadata. Ingest re-applies it at completion if a same-named sibling appeared during the upload.
- **Duplicate** can only be known _after_ the server-side hash exists. It shows as a non-blocking notice with "Discard this copy".

### Background jobs (Jobs module, ADR-0006)

- Generate Previews after an Upload completes
- Purge Trash entries older than 30 days (hourly)
- Delete Uploads with no progress for 24 h
- GC of Blobs with zero references: daily, and soon after anything is deleted for good
- Nightly `pg_dump` into the data volume

## Stack

- **Nuxt** (Nitro `node-server` preset), **Postgres** + **Drizzle**, **Better Auth**, `@tus/server` / `tus-js-client`, **sharp**
- **bun** for installs/scripts; **Node** runtime; **Vitest** (ADR-0004)
- **Reka UI** (headless) with a custom, calm style inspired by PrimeVue Aura: soft surfaces, generous radii, subtle borders, one accent colour
- ESLint (`@nuxt/eslint`) + Prettier

## Testing (local only)

- Vitest module tests through each module's interface, against **PGlite**, plus one pass against real Postgres
- BlobStore is tested on a temporary directory
- No mocking of the database or file system inside modules
- Playwright smoke tests: log in → upload a large file with an interrupted resume → share it → open the link logged out

## Deployment

- `docker compose`: `app`, `postgres`, `cloudflared`; volumes `pgdata` and `data` (`/data/blobs` and `/data/uploads` share one filesystem, so finishing an Upload is a rename, not a copy)
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
