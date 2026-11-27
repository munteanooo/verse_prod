# ADR 0006 — Private objects, bounded PDF processing and guarded publication

**Status:** Accepted

Use an S3-compatible adapter behind a small object contract, plus explicitly configured loopback filesystem storage for development and tests. Upload directly to temporary keys and commit independently validated bytes to write-once trusted keys. Serve public raster derivatives through a current-release gate and issue short-lived attachment grants for authorized PDFs.

Generate A4 with vector form embedding, clipping and translation and preserve original A4 bytes when already tiled. Use a bounded, terminable worker and PostgreSQL render leases. Publish through a narrowly granted PostgreSQL function that validates the actor, draft revision and associated file metadata. Keep withdrawal outside immutable version history.
