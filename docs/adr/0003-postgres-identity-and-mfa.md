# ADR 0003 — PostgreSQL identity and session-bound MFA

**Status:** Accepted

Use Better Auth with its Drizzle PostgreSQL adapter and server-side sessions. Drizzle migrations are authoritative. A database trigger assigns CUSTOMER in the account creation transaction. Use a separate operator credential for migrations and role changes. Operator role changes revoke prior sessions and persist audit events in the same transaction.

Use Postgres.js with prepared statements disabled and a pool cap of two connections per process. Use pooled connections for hosted applications and a direct connection for the operator. Requests never run migrations.

Require explicit session-bound evidence from Better Auth's TOTP or one-use recovery codes for privileged permissions. Evidence expires for elevation after 12 hours and disappears when the session is revoked. Device trust is disabled at the HTTP boundary. The authorization guard looks up the current role on every protected request.

Use an atomic PostgreSQL bucket at the HTTP boundary to serialize conflicting attempts across serverless instances. Use SMTP as a replaceable delivery adapter and Mailpit locally. Keep email-initiated responses generic to reduce account enumeration.
