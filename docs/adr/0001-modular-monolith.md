# ADR 0001 — One Next.js modular monolith

**Status:** Accepted

Use a single App Router application and Route Handlers with separate public and admin rendering boundaries. Add domain and use-case modules when the first actual workflows need them. Use plain TypeScript contracts around PostgreSQL and S3 where substitution is beneficial. This keeps installation and deployment small while preserving portable domain logic.

Use the supported Webpack mode consistently in development and production builds. The Phase 1 build environment restricted the internal socket used by the Turbopack CSS worker. The choice is reversible and has no hosting dependency.
