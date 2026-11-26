# Security baseline

The admin layout and page both call a server guard. It retrieves a verified Better Auth session from PostgreSQL, reads the role and requires recent MFA evidence on the current session. Administrative API paths remain closed. The public portal and liveness endpoint work independently of identity services.

## Passwords, sessions and recovery

Better Auth 1.7 uses Node's scrypt with N=16384, r=16, p=1, a random 16-byte salt and a 64-byte derived key. It normalizes passwords with NFKC. VERSE uses the upstream implementation with a 12–128 character policy and database rate limiting. The locked Node implementation compares derived hexadecimal strings with ordinary equality. Treat that behavior as an upstream limitation in production review.

Sessions have a seven-day lifetime and disable cookie caching. Read guards disable refresh and recheck expiry and revocation against the database. Cookies are HttpOnly and SameSite=Lax and are Secure on HTTPS. Remote deployments require HTTPS. A reset revokes existing sessions. Sign-out revokes the current session. Account users can revoke all their sessions.

Verification links last 30 minutes and reset links 15 minutes. Password resets are single use. Reset and challenge identifiers are stored as hashes. Email links use fixed same-origin paths and carry tokens in browser fragments. The browser removes the fragment and submits the token in a POST body. It never sends the token in an HTTP URL. Registration and email delivery requests return generic acknowledgements for valid input. Unverified and invalid logins share an error response. Timing differences across account and SMTP operations can still exist. Without SMTP, initiating an email workflow fails closed. Existing valid sessions and already-issued tokens remain usable within their lifetimes.

TOTP and one-use recovery codes are supported. After 12 hours, sign out and sign in again to get fresh elevation. Keep recovery codes offline. If both the authenticator and recovery codes are lost, suspend privileged access through the operator CLI and independently verify the user before initiating account recovery.

## HTTP and audit

Mutations require the exact canonical Origin and Better Auth's trusted-origin checks. Zod validates bounded JSON. Only current-feature endpoints are exposed. The boundary removes user-supplied callbacks, role fields and device-trust flags. Keep request-body logging disabled for authentication endpoints.

Sensitive pages receive nonce-based CSP with strict-dynamic, framing disabled and same-origin form actions. Inline styles are allowed for Tailwind and rendering. The static landing page retains its existing headers. Protected pages and identity responses use no-store and no-referrer policies.

PostgreSQL permits 30 requests per endpoint and client per minute, and six per endpoint and normalized email. Vercel uses its platform IP header. Other environments share an endpoint bucket. This can affect availability under load. Database errors fail closed. Schedule operator-controlled pruning of expired auth_throttle rows before broad deployment.

Audit records persist provisioning, role changes, successful privileged authentication, authenticated access denials and privileged session revocations. They include server-generated correlations and omit credentials, cookies, tokens and OTPs. The runtime login must have insert-only audit privileges. Agree on retention, hosting log redaction, supply-chain review and monitoring before commercial operation.
