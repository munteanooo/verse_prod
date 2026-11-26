# Architecture

VERSE is a modular monolith with one Next.js App Router application. Route Handler and React entry points compose application use cases as features arrive. Customer and admin presentation have separate shells. TypeScript domain and use-case modules will own business rules and consume narrow repository or adapter contracts where substitution is useful. Next.js, Drizzle, Better Auth and infrastructure clients belong at composition or implementation boundaries.

Phase 1 creates only directories with active responsibilities. There are no empty domain, migration, upload, backup or infrastructure placeholders. The app root serves the public route group. Phase 2 activates the shared administration shell behind session, role and MFA guards. Authentication uses the framework convention under `/api/auth`; `/api/v1` remains the application API namespace. URL validation takes a small environment input and is reused at configuration load and in the metadata module. Routing literals appearing in framework conventions and statically analyzed matchers are covered by route smoke checks.

See [Identity schema](identity.md) for the Phase 2 tables. No application profile duplicates Better Auth identity fields.

Phase 3 implements the [administrative catalog](catalog.md), including pattern versions and sizing.

Phase 4 implements the [public catalog and private measurement profiles](customer.md).

## Planned relational model

The following is design documentation for future feature tables. Use UUID primary keys where appropriate, UTC `timestamptz`, explicit foreign key actions and indexes on frequently joined foreign keys. Manage migrations in version control.

| Entity                         | Relationships and constraints                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| file_assets                    | Unique storage key, ownership, size, media type, checksum and access classification                   |
| orders, payments, entitlements | Future commerce and provider event idempotency. Entitlements reference the buyer and purchased access |
| generated_patterns             | Future generated artifacts linked to owner, source version and file asset                             |

Publication uses a transaction, row-level concurrency control where appropriate and an explicit lifecycle. Published content is immutable. Changes produce a new draft. Archive retains references and history. Hard deletion is restricted and requires a defined retention or privacy workflow. Explicitly define cascades when implementing the schema.

## Planned pattern and document workflow

The workflow takes functional inspiration from [FreeSewing](https://freesewing.eu/), especially the progression from choosing a garment to working with measurements. VERSE uses its own presentation, copy and assets.

Start with uploaded PDF patterns and recommend an existing size only when matching measurement rules. Store dimensions in millimeters and convert to PDF points at 72 points per inch. Tiling must preserve vector geometry and use A4, configurable printable margins and overlap, alignment, page numbering, a 50 mm calibration square and print-at-100-percent instructions. Keep computationally intensive generation portable through a replaceable execution adapter. Personalized drafting requires professional validation of drafting rules and geometry.

Store original assets privately with short-lived authorized URLs. Keep public previews separate. Validate size, media type, signatures and upload completion before publishing references. Accept PDF and supported raster formats initially. File signature validation does not detect malware. Future checkout uses hosted payment pages, verified idempotent webhooks and server-controlled prices and entitlements.
