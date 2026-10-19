# ADR-0005: Library is accessed through an owner-scoped handle

**Status:** Accepted · 2026-10-19

## Context
Several people's files live on one disk. If every Library call took `ownerId` as a parameter, any call site that forgot or confused it would leak data between users.

## Decision
- Callers obtain `library.for(user)` and every operation runs inside that Owner's scope. There is no unscoped public interface.
- Failures are **thrown typed domain errors** (`NotFound`, `NameConflict`, `InvalidMove`, …). They are mapped to HTTP status codes in one place, the `defineApiHandler` wrapper in `server/utils/api.ts` (which every route uses). We don't take over Nitro's `errorHandler`, because that would replace Nuxt's error page.

## Consequences
- Route handlers stay one-liners. Tests assert `rejects.toThrow(NameConflict)`.
- Admin-only cross-owner operations (purging a disabled Member) are a separate, explicitly named entry point, not a way around the handle.
- Something that doesn't belong to the Owner and something that doesn't exist both surface as `NotFound`, so the existence of other users' items is never revealed.
