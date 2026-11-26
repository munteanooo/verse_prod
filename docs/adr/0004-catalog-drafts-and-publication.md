# ADR 0004 — Relational catalog drafts and immutable versions

**Status:** Accepted

Separate stable pattern ownership and archival from numbered version content. Store ordered pieces, selected measurements, sizes and ranges in relational tables. Keep mutable library data separate and snapshot the category and each referenced measurement to protect historical output.

Use an explicit full-draft save with an optimistic revision and lock the stable pattern during writes. Data changes and audit events commit together. PostgreSQL freezes historical versions and their children. The Next.js administrative routes and versioned JSON API share the same catalog service.

Keep the publication transition unavailable until the document integration can verify all required files. The administrative readiness action records why publication was rejected. A future transition will enforce asset validation transactionally against the selected draft revision.
