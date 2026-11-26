# Customer catalog and private measurements

## Public visibility

Public reads use specific projections from the Phase 3 catalog tables. A discoverable version must be the newest published version of its stable pattern, have a publication timestamp at or before the current time, and belong to an active category and a non-archived pattern. A newer draft never replaces a published version. Category counts, detail lookups and sitemaps share this boundary. Public DTOs omit ownership, revisions, audit records, administrative flags and storage references.

The catalog uses validated search, category, difficulty, price and sorting inputs and paginates in PostgreSQL, 12 records per page. Public category indexes expose up to 500 active categories. Sitemaps use the configured canonical origin and include up to 10,000 discoverable pattern paths. The home page uses published cards when available and an honest empty state otherwise. Phase 3 publication remains blocked. Automated tests create synthetic published rows through the operator connection to an isolated loopback database with a test-only name.

## Measurement fields and recommendation

A shared renderer takes the fields supplied by the published version and also serves the admin preview. The server uses the matching snapshots and pattern overrides for validation. A field's stable definition ID, label, instructions, required flag and unit are independent of garment type. Display values use centimetres or millimetres. A decimal string is parsed directly to integer micrometres. Unsupported units, mismatched display units, excess precision and out-of-range values are rejected. Values are never rounded into a valid range.

The server rejects invalid input before checking completeness. Every required field must be present and at least one measurement is needed. Missing optional values are ignored. Supplied optional values become additional constraints, and sizes lacking a range for any supplied measurement produce an incomplete configuration result. Inclusive bounds determine the compatible set. The result explicitly distinguishes one, multiple or zero compatible sizes. Customers can still select a different listed size. The calculator never infers nearest fit or geometry.

## Profile storage

Migration `0002_measurement_profiles.sql` adds `measurement_profiles` and `measurement_values`. Profiles have UUIDs, an indexed owner foreign key, timestamps and an optimistic revision. A value is unique per profile and definition and stores an exact length with the original field metadata and bounds. The latest discoverable pattern snapshots provide new measurement choices. Existing entries preserve their snapshot after the source changes or becomes unavailable. Reusing a profile converts the canonical value to the selected pattern's unit only when that value is exact and valid under its bounds and precision.

Ownership is checked using the verified session user ID. Creation, edits and deletion require an explicit action. Profile deletion cascades to its values, and deleting an identity cascades to profiles. The application caps profiles at 30 per account and values at 100 per profile. Operator-only PostgreSQL access and backups remain subject to existing retention and privacy policies.

For a deployment apply the runtime grants below after the migration, in addition to identity and catalog grants.

```sql
GRANT SELECT, INSERT, DELETE ON measurement_profiles, measurement_values TO verse_runtime;
GRANT UPDATE (name, revision, updated_at) ON measurement_profiles TO verse_runtime;
```

## API

| Method             | Path under `/api/v1`                 |
| ------------------ | ------------------------------------ |
| GET                | `/patterns`, `/patterns/[slug]`      |
| GET                | `/categories`, `/categories/[slug]`  |
| POST               | `/patterns/[slug]/recommend-size`    |
| GET, POST          | `/account/measurement-profiles`      |
| GET, PATCH, DELETE | `/account/measurement-profiles/[id]` |

JSON endpoints return explicit no-store responses. Guest recommendations send values in a bounded POST body and return only the compatibility outcome and public size or field IDs. They never store measurements. Requests use the existing PostgreSQL rate limiter. Profile mutations require the exact configured origin and an authenticated owner. No body measurements enter audit, analytics, URLs or application error logs.

## Phase 5 integration

A neutral placeholder represents the missing cover asset. The detail view explains that digital documents are unavailable. Phase 5 must add asset validation and controlled access checks before enabling publication or downloads. Premium labels and amounts describe the pattern's classification and never imply a purchase or entitlement.
