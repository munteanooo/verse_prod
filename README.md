# VERSE

`verse_prod` is a Romanian-first web application for sewing patterns. Phase 1 provides the public foundation, a liveness endpoint and a closed administration area.

## Local development

Requirements are Git, Node.js 24 and pnpm 10.28.2. Use a Node version manager with `.node-version` or install Node.js 24 from the official distribution. If pnpm is missing, run `npm install --global pnpm@10.28.2`.

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000/`. Try the collection link and all three navigation links, then resize to a mobile viewport. `/admin` and its descendants return 404. `/api/v1/health` returns HTTP 200 with `{"status":"ok"}`. A missing public page shows a Romanian recovery screen.

The app runs with no environment file. To set an explicit local origin, copy `.env.example` to `.env.local` and uncomment its example. `VERSE_SITE_URL` accepts an HTTPS origin or a loopback HTTP origin and is used for canonical metadata. Omit it if the canonical origin is unknown. Use no path, query, fragment or credentials. No external account is required.

## Verification

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

On a clean Linux machine use `pnpm exec playwright install --with-deps chromium` if the system libraries are missing. Playwright starts the production build on loopback port 3100 and checks desktop and mobile Chromium. Run `pnpm start` after the build for manual production verification. Run `pnpm format` to apply formatting.

## Repository map

| Path                | Responsibility                                                        |
| ------------------- | --------------------------------------------------------------------- |
| `src/app`           | App Router, public pages, fail-closed admin routes and health handler |
| `src/config`        | Project identity, routes, URL validation and application metadata     |
| `src/i18n`          | Romanian message catalog and supported locale identifiers             |
| `src/components`    | Shared UI and separate presentation shells                            |
| `src/proxy.ts`      | Deny-by-default administrative namespace guard                        |
| `public/images`     | Project-owned demo imagery                                            |
| `tests`             | Vitest unit tests and Playwright smoke tests                          |
| `.github/workflows` | Read-only CI validation                                               |
| `docs`              | Architecture, design decisions, security and hosting                  |

## Manual hosting setup

1. If repository hosting is wanted, create or select the GitHub repository manually and configure its real remote. Enable the `Validate` branch protection check when available.
2. When ready for a personal, non-commercial prototype, create or import the Next.js project in Vercel using a Hobby account and the default project subdomain. Choose project slug `verse-prod` for the proposed hostname if available. Set Node.js 24 and keep pnpm selected through the manifest and lockfile. Keep external integrations and paid services disabled.
3. Enter the actual canonical HTTPS origin as `VERSE_SITE_URL` for Production. Leave it unset in Preview unless an explicit preview canonical is needed. Verify the routes above after a manually approved deployment.
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
