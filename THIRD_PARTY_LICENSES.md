# Third-party licenses

Phase 1 uses the following direct dependencies. The exact resolved versions are recorded in `pnpm-lock.yaml`.

| License    | Runtime packages                                     | Development packages                                                                                                                                                                    |
| ---------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MIT        | Next.js, React, React DOM, Zod, clsx, tailwind-merge | Tailwind CSS and its PostCSS integration, Vitest, Prettier, ESLint, ESLint JS, Next.js ESLint plugin, React Hooks ESLint plugin, typescript-eslint and the Node and React type packages |
| ISC        | Lucide React                                         |                                                                                                                                                                                         |
| Apache-2.0 |                                                      | TypeScript and Playwright                                                                                                                                                               |

The pnpm license inventory of the installed macOS ARM64 dependency tree contained MIT, Apache-2.0, LGPL-3.0-or-later, BlueOak-1.0.0, CC-BY-4.0, ISC, BSD-2-Clause, BSD-3-Clause, MPL-2.0 and 0BSD. These permit commercial use subject to their terms. Retain applicable copyright notices and license texts when distributing. In particular, preserve caniuse-lite attribution and review source and notice obligations when distributing libvips or modified MPL-covered Lightning CSS files. Sharp and its platform-specific libvips dependency support image optimization. Chromium and its bundled components are test tooling. See the notices shipped with browser distributions.

The remaining 72 lockfile entries, primarily optional platform binaries, were checked against their exact npm registry versions. Their declared licenses match the same set, including combined terms for Sharp on Windows and WASM. Run `pnpm licenses list --json` after installation and review the terms and notices for the chosen distribution target. Hosted service terms are separate from dependency licenses. GitHub Actions workflow dependencies are checkout, setup-node and pnpm action-setup under MIT.

The shadcn/ui foundation uses local UI source, compatible aliases and CSS tokens. The upstream shadcn/ui project uses MIT. The editorial hero is an AI-generated demonstration image created for this application. Garment silhouettes are project CSS. The application uses system font stacks, with no redistributed fonts or hotlinked images.

## Phase 2 additions

| Dependency                          | Version | License    |
| ----------------------------------- | ------- | ---------- |
| Better Auth and its Drizzle adapter | 1.7.28  | MIT        |
| Drizzle ORM                         | 0.45.4  | Apache-2.0 |
| Drizzle Kit                         | 0.31.11 | MIT        |
| Postgres.js                         | 3.4.9   | Unlicense  |
| Nodemailer                          | 10.6.1  | MIT-0      |
| Nodemailer types                    | 8.0.2   | MIT        |
| tsx                                 | 4.23.15 | MIT        |

The 111 added or changed lock entries were checked using pnpm license inventory and exact npm metadata for entries that were not installed on macOS ARM64. They declare MIT, Apache-2.0, MIT-0, Unlicense or BSD-3-Clause. Stable Drizzle Kit currently resolves two deprecated MIT development subdependencies from esbuild-kit. PostgreSQL (PostgreSQL License) and Mailpit (MIT) run as local test services. No hosted authentication or email service is required for testing.

## Phase 3 additions

The administrative catalog reuses the locked Phase 2 dependencies. Phase 3 introduces no additional packages or assets.

## Phase 4 additions

The customer catalog and forms reuse the existing lockfile. Phase 4 adds no dependencies or third-party assets.

## Phase 5 additions

| Package                                 | Version  | License    |
| --------------------------------------- | -------- | ---------- |
| pdf-lib                                 | 1.17.1   | MIT        |
| sharp                                   | 0.35.5   | Apache-2.0 |
| AWS SDK S3 client and request presigner | 3.1178.0 | Apache-2.0 |

The 31 added lock entries were checked with the installed package inventory. Their declared licenses are Apache-2.0, MIT, MIT AND Zlib and 0BSD. Sharp's already-locked libvips binaries retain their previously documented license obligations. The original synthetic fixture uses PDF's standard Helvetica font without redistributing a font binary.
