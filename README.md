# VERSE

`verse_prod` is a Romanian-first web application for sewing patterns. Phase 5 adds validated pattern documents, A4 generation and free-pattern publication and downloads.

## Local development

Requirements are Git, Node.js 24 and pnpm 10.28.2. Use a Node version manager with `.node-version` or install Node.js 24 from the official distribution. If pnpm is missing, run `npm install --global pnpm@10.28.2`.

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000/`. The public landing page and liveness endpoint work without an environment file.

### PostgreSQL and SMTP

1. Start local PostgreSQL 17. From a local PostgreSQL administrator account, run `createuser --pwprompt verse_operator` and `createdb --owner=verse_operator verse_prod`. A development database can use that role for both URLs. Use separate roles for deployments.
2. Copy `.env.example` to `.env.local`. Set `VERSE_SITE_URL`, `DATABASE_URL`, `DATABASE_MIGRATION_URL` and `BETTER_AUTH_SECRET`. Generate the secret using the example command.
3. Run `pnpm db:migrate` explicitly. Use `pnpm db:generate` only when intentionally changing the schema. The application never migrates on startup.
4. Run `mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025`. Set `VERSE_SMTP_URL` and `VERSE_EMAIL_FROM` as in the environment example. Open the local inbox at `http://127.0.0.1:8025`. [Mailpit installation](https://mailpit.axllent.org/docs/install/)
5. Start `pnpm dev`, register at `/register`, open the verification link, confirm the address, and log in at `/login`. Use `/account` to sign out or revoke sessions. Use `/forgot-password` for password reset and `/verify-email` to request a new verification link.

### First administrator

1. Register and verify an account. Sign in and configure an authenticator on `/account`. Save the one-use recovery codes offline.
2. From a trusted environment with the operator database URL, run `pnpm identity:role <verified-email> ADMIN`. It records the promotion and revokes old sessions. Repeating it for the same assignment has no effect.
3. Sign in again with the password and an authenticator or recovery code, then open `/admin`. The server requires a verified account, an ADMIN assignment and a recent second factor on the current session.

The CLI can also set `DESIGNER` or `CUSTOMER`. Roles cannot be assigned over HTTP. See the [schema and grants](docs/architecture/identity.md) and [security baseline](docs/security/baseline.md).

## Administrative catalog

Run `pnpm db:migrate` with the operator URL before opening the catalog. Sign in with an ADMIN account and MFA. Open `/admin/categories` and `/admin/measurements` to configure reusable entries. Then go to `/admin/patterns/new`, save a draft and use the edit and preview links from the pattern list.

Optional measurement examples can be applied with `psql -d verse_prod -f scripts/catalog/seed-measurements.sql` against local development PostgreSQL. The seed is idempotent and patterns can use any subset of the library.

For a deployed database, apply the Phase 3 runtime grants separately. Publishing requires validated files and the Phase 5 publication grants. See the [catalog architecture and grants](docs/architecture/catalog.md) and the [Romanian atelier guide](docs/guides/atelier.md).

## Customer catalog

Apply the profile migration using `pnpm db:migrate`. Visit `/patterns` and `/categories` for the public catalog and `/account/measurements` to manage private profiles. The catalog stays empty until an administrator validates the required assets and publishes a pattern. Published fixtures exist only in isolated automated tests. Run `pnpm test:e2e:identity` to verify a synthetic published detail, the mobile size table, profile reuse and blocked access by a different account.

See the [customer architecture and database grants](docs/architecture/customer.md) and [Romanian atelier guide](docs/guides/atelier.md).

## Documents and publication

Apply `pnpm db:migrate` and configure explicit local storage using `STORAGE_PROVIDER=local` and a private absolute `STORAGE_LOCAL_ROOT`. Run `pnpm dev`, sign in with administrator MFA and open the pattern wizard. The local storage adapter can run without S3 or Cloudflare credentials.

Generate synthetic sample files with `node scripts/documents/demo.mjs /tmp/verse-demo`. Follow the [Romanian atelier guide](docs/guides/atelier.md) to configure a free pattern, upload the sample, validate its scale, generate A4, preview and publish. The [printing guide](docs/guides/imprimare.md) covers customers' print settings. See the [Phase 5 storage environment, limits and database grants](docs/architecture/documents.md) before configuring hosted storage.

## Verification

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Use `pnpm exec playwright install --with-deps chromium` if system libraries are missing on Linux. Public tests use port 3100 without identity credentials. For identity tests, start a separate loopback database with a name ending in `_test` and export its URL. Use synthetic data and Mailpit.

```sh
export TEST_DATABASE_URL=postgresql://verse_test@127.0.0.1:5432/verse_prod_test
DATABASE_MIGRATION_URL="$TEST_DATABASE_URL" pnpm db:migrate
pnpm test:integration
pnpm test:e2e:identity
```

The identity browser test uses a production build on port 3103 and the default SMTP/HTTP mail ports 1025/8025. Override the mail ports through `TEST_SMTP_PORT` and `TEST_MAILPIT_PORT`.

## Repository map

| Path                                                    | Responsibility                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/app`                                               | Public and identity pages, protected admin layout and API handlers  |
| `src/config`                                            | Project identity, routes, URL validation and application metadata   |
| `src/i18n`                                              | Romanian message catalog and supported locale identifiers           |
| `src/components`                                        | Shared UI and separate presentation shells                          |
| `src/proxy.ts`                                          | Sensitive-page CSP and fail-closed behavior without identity config |
| `public/images`                                         | Project-owned demo imagery                                          |
| `src/infrastructure`, `src/modules/identity`, `drizzle` | Database, Better Auth, email, policies, audit and migrations        |
| `tests`                                                 | Vitest unit tests and Playwright smoke tests                        |
| `.github/workflows`                                     | Read-only CI validation                                             |
| `docs`                                                  | Architecture, design decisions, security and hosting                |

## Manual hosting setup

1. If repository hosting is wanted, create or select the GitHub repository manually and configure its real remote. Enable the `Validate` branch protection check when available.
2. When ready for a personal, non-commercial prototype, create or import the Next.js project in Vercel using a Hobby account and the default project subdomain. Choose project slug `verse-prod` for the proposed hostname if available. Set Node.js 24 and keep pnpm selected through the manifest and lockfile. Keep external integrations and paid services disabled.
3. Enter the actual canonical HTTPS origin as `VERSE_SITE_URL` for Production. Set the runtime database URL and auth secret only in approved Vercel environments. Set SMTP and sender after configuring a real delivery provider. Keep the migration URL in the operator environment. Use separate databases and origins for previews with identity enabled.
4. Review the provider terms before any commercial use. Project import can enable automatic deployments on future pushes. Configure the integration to match the desired release policy before connecting the repository.

See [hosting and recovery](docs/architecture/hosting.md), [architecture](docs/architecture/overview.md), [security](docs/security/baseline.md), and [dependency licensing](THIRD_PARTY_LICENSES.md).

## Roadmap

1. Project Foundation
2. Database, Authentication & RBAC
3. Admin Pattern Wizard
4. Customer Catalog & Dynamic Forms
5. PDF & File Management
6. Security, Backup & Deployment
7. Payments & Monetization
8. Parametric Pattern Engine
9. Mobile Application
