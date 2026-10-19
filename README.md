# Arca

A self-hosted file backup and sharing app for you and the people you invite.

Design: [`docs/design.md`](docs/design.md) · Domain language: [`GLOSSARY.md`](GLOSSARY.md) · Decisions: [`docs/adr/`](docs/adr/)

## Develop

```sh
bun install
cp .env.example .env   # set NUXT_AUTH_SECRET (openssl rand -base64 32)
bun run dev            # http://localhost:3000, data in ./.data (PGlite, no Docker needed)
```

The first visit asks you to create the admin account.

| Command                                 |                                                      |
| --------------------------------------- | ---------------------------------------------------- |
| `bun run test`                          | Module tests (Vitest, in-memory Postgres)            |
| `bun run test:e2e`                      | Smoke tests (Playwright, against a production build) |
| `bun run typecheck` / `lint` / `format` |                                                      |
| `bun run db:generate`                   | New migration after changing `server/db/schema.ts`   |

## Run with Docker

```sh
cp .env.example .env   # set NUXT_AUTH_SECRET, NUXT_BASE_URL, POSTGRES_PASSWORD
docker compose up -d --build
```

Arca listens on `127.0.0.1:3000`. Migrations run automatically on startup.
