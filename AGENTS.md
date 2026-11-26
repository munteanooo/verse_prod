# VERSE repository instructions

- Implement one development phase at a time. Keep changes in scope and avoid unrelated refactoring.
- Use strict TypeScript. Justify any use of the `any` type.
- Keep business logic outside React components and platform adapters.
- Keep administrative routes and endpoints closed until server-side authentication and authorization are implemented.
- Avoid fake production-ready implementations and silent error swallowing.
- Keep credentials out of source control, client bundles and logs.
- Add dependencies only when needed and verify commercial licensing, including transitive dependencies and assets.
- Document significant architecture decisions in `docs/adr`.
- Keep technical documentation and identifiers in English. Put user-facing copy in the localization layer.
- Deploy manually only with explicit authorization. Enable paid services or billing only with explicit approval.
- Confirm destructive operations before executing them.
- Run the relevant checks and report the results actually observed.
