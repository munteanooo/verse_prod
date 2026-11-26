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
