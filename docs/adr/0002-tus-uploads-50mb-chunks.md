# ADR-0002: Resumable uploads via tus, 50 MB chunks

**Status:** Accepted · 2026-10-19

## Context

Files range from photos to roughly 10 GB archives and videos. Arca is exposed through **Cloudflare Tunnel**, which caps a single request body at 100 MB. A dropped connection must not restart a multi-GB transfer.

## Decision

All uploads use the tus protocol: `@tus/server` mounted in Nitro, and `tus-js-client` in the browser. The chunk size defaults to **50 MB** and is a config value (`ARCA_UPLOAD_CHUNK_BYTES`), not a constant.

## Consequences

- Uploads resume after a reload or a closed tab (using the tus fingerprint in localStorage).
- The server hashes chunks as they stream in, so a 10 GB file is never buffered in memory.
- Uploads with no progress for 24 h are deleted by a background job.
- Moving off Cloudflare Tunnel only requires changing the config value.
