# ADR-0001: Postgres as the database

**Status:** Accepted · 2026-10-19

## Context

Arca is self-hosted for a handful of invited users. SQLite would have meant a single file and no extra container. Postgres would mean a second service in docker compose.

## Decision

Use Postgres (accessed through Drizzle), running as its own compose service.

## Consequences

- Search uses `pg_trgm` for typo-tolerant filename matching (see the Search module).
- The background job queue runs on **pg-boss** inside the same database, so there's no Redis.
- Module tests run against **PGlite** (in-process WASM Postgres) for speed, plus one pass against real Postgres to catch differences.
- The nightly `pg_dump` is part of the backup story (see `docs/design.md`).
