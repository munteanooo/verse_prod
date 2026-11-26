# ADR 0002 — Environment-based configuration and closed administration

**Status:** Accepted. The temporary admin boundary is superseded by ADR 0003.

Keep identity in `src/config/project.ts`, localized metadata in the Romanian catalog and the composed metadata and canonical site origin in `src/config/application.ts`. Validate the optional origin on startup without guessing a deployment host. Keep the root page usable offline and allow self-contained local and production builds.

Deny administrator paths in the proxy and at the UI layout until an authenticated and authorized administration flow exists. Test the shell in isolation. Render only the public demo in accessible routes.
