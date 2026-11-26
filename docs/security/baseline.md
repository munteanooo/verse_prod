# Security baseline

Phase 1 accepts no personal data, uploads or credentials. A namespace proxy returns a non-cacheable 404 for `/admin` and `/api/v1/admin` and their descendants in every environment. The admin layout independently denies rendering. The administrative shell can be rendered in an isolated unit test. The liveness endpoint has no dependency probes and exposes only status.

HTTP responses configure MIME sniffing protection, anti-framing, a referrer policy and restrictions on browser camera, microphone and location access. HSTS is configured when an HTTPS origin is supplied. A CSP compatible with Next.js rendering and distributed rate limiting are deferred to security hardening. Keep error pages generic and avoid exposing internal details.

## Planned authorization

Better Auth will use database-backed sessions. Application use cases and Route Handlers must validate session, role and resource ownership on the server. Use CUSTOMER, DESIGNER and ADMIN roles with least privilege. Privileged assignment uses trusted provisioning and privileged production access requires MFA. Define authorization rules per operation and test denial paths. Use transactional role changes and record safe audits.

Validate all writes on the server. Use parameterized queries, safe redirects, secure cookie attributes and CSRF protection where applicable. Add structured logging and request correlation IDs at infrastructure boundaries. Never log passwords, auth tokens, session identifiers, signed URLs, payment card data or body measurements. Treat measurements as private data with explicit access and deletion policies. Keep database and storage credentials on the server.
