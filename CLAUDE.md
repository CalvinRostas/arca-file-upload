# Arca

A self-hosted, multi-user file backup and sharing app (Nuxt 4 + Postgres). Read these before changing behaviour:

- [`docs/design.md`](docs/design.md): scope, modules, milestones
- [`GLOSSARY.md`](GLOSSARY.md): the domain language. Use its terms (Owner, Item, File, Folder, Blob, Share link, …) in code, comments, docs and UI
- [`docs/adr/`](docs/adr/): load-bearing decisions. Add an ADR when you make a new one; don't silently contradict an existing one

## Commands

Use **bun** for installs and scripts. The server runs on **Node** (ADR-0004).

| Command                                 |                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `bun run dev`                           | Dev server on :3000, data in `./.data` (PGlite, no Docker needed)                   |
| `bun run test`                          | Vitest module tests against in-memory PGlite (`ARCA_TEST_DATABASE_URL` for real PG) |
| `bun run test:e2e`                      | Playwright against a production build (`.output-e2e`, port 3100, `pglite:memory`)   |
| `bun run typecheck` / `lint` / `format` | Run all three before committing; Prettier is enforced                               |
| `bun run db:generate -- --name <what>`  | New migration after editing `server/db/schema.ts`                                   |

Definition of done for a change: module tests + e2e green, typecheck/lint/prettier clean, and for UI work, screenshots checked in light, dark and mobile (write a throwaway Playwright spec that saves to `/tmp/arca-shots/`, then delete it).

## Architecture

- **Deep modules** in `server/modules/<name>/index.ts` (Library, Ingest, BlobStore, Previews, Jobs, Tags, Search, Shares, Auth, Zip). Each is a `createX({ db, … })` factory with a small interface hiding most of the behaviour. Test through that interface.
- **Thin route adapters** in `server/api/**`: parse/validate (zod, `server/utils/validation.ts`), call one module, shape the response. Always `defineApiHandler`, never `defineEventHandler`. It is the single place where `DomainError`s (`server/modules/errors.ts`) become HTTP errors with `data.code`; the client reads that with `apiErrorCode` / `apiErrorMessage`.
- **Wiring** lives only in `server/utils/arca.ts` (`useArca()`, `useOwnerLibrary(event)`, `useOwnerScope(event)`, `useOwnerShares(event)`).
- **Owner scoping (ADR-0005)**: all Library/Tags/Search/Shares access goes through `x.for(owner)`. Never query owned rows without the Owner. Share visitors get `library.for(owner).within(rootId)`, which checks reach by walking _up_ from the requested Item.
- **BlobStore** is the only seam with adapters (local disk now, S3/R2 later). Don't add seams elsewhere until a second adapter actually exists.
- Background work goes through the in-house **Jobs** queue (ADR-0006), not timers.
- File responses: `sendStoredFile` / `sendThumbnail` / `sendZip` in `server/utils/` (range requests, safe inline types, Content-Disposition).

## Key decisions (details in the ADRs)

- Postgres + Drizzle; PGlite for dev and tests (0001)
- Uploads via tus, 50 MB chunks, resumable across reloads (0002)
- Global, invisible Blob dedup by SHA-256; only same-Owner Duplicates are surfaced (0003)
- Blob GC under a row lock so a concurrent upload can't lose its Blob (0007)
- Name collisions are decided _before_ bytes are sent (replace / keep both / skip); Duplicates only after hashing
- Trash: one entry per deleted subtree, restore recreates the path, 30-day purge
- Share links (0008): one link per Item, token stored so it can be re-copied; argon2 passwords; signed 24 h Pass cookie; per-link (not per-IP) rate limit, no visitor IPs logged; a download limit turns previews off; a link pauses while its Item is in Trash

## Frontend

- Nuxt 4 `app/`, **Reka UI** (headless) + **Tailwind v4**; icons `lucide:*` via `@nuxt/icon`; font Atkinson Hyperlegible Next, self-hosted via `@nuxt/fonts`.
- Look: calm, PrimeVue Aura-inspired: soft surfaces, generous radii, subtle borders, one accent (verdigris). Use the theme tokens from `app/assets/css/main.css` (`bg-ground/surface/sunken`, `border-line`, `text-ink/muted/faint`, `accent`, `danger`, `rounded-control/tile/panel`, `shadow-float`), never raw colours. Tag colours are `var(--tag-<name>)` via `tagColor()`.
- Components are auto-imported by file name (`pathPrefix: false`); folders are grouping only. Reuse the `Ui*` primitives (`UiButton`, `UiDialog`, `UiField`, `UiSwitch`, `UiBreadcrumb`, `UiCopyField`, `UiAlert`) before writing new markup.
- Light / dark / system via `@nuxtjs/color-mode`; every screen must work in both and on mobile.
- Accessibility is load-bearing: e2e tests select by role and accessible name, so give icon buttons `aria-label`s and keep labels stable.
- UI copy: plain, friendly, sentence case, typographic quotes and apostrophes (’ “ ”), and say what happens ("Delete from 3 files?"), not just "Are you sure?".

## Testing notes

- Module tests: `freshDatabase()` from `test/support/db.ts` per test, `makeUser()` for Owners; inject `now` for time-dependent logic instead of mocking timers.
- E2E: one worker, one server, **one database shared by all specs**. Use unique names and don't assume an empty Library. `signInAsAdmin(page)` works in any spec order.
- Hydration races: when a keyboard shortcut is pressed right after navigation, wrap it in `expect(...).toPass()`.

## Status

Milestones 1–6 are done: Skeleton, Library + BlobStore + Ingest, Browsing, Tags + Search, Trash, Shares. Next is **7, Ops**: nightly `pg_dump` backups, Docker Compose with cloudflared, a real-Postgres test pass, a README backup/restore recipe, and the full smoke test.

## Working with the user

- Preferences: bun, Reka UI, a calm PrimeVue-like look.
- Questions: terse, one recommended option each. Decide small things yourself and report them afterwards.
- Work milestone by milestone: finish, commit, report with screenshots and the decisions made, then ask before starting the next one.

## Skills used on this project

- `grilling`: stress-tested the initial design (auth, folders, tags, search, sharing) → `docs/design.md`, `GLOSSARY.md`
- `codebase-design`: deep-module vocabulary and seam placement → the Modules table and ADR-0005
- `frontend-design`: the visual direction and theme tokens
