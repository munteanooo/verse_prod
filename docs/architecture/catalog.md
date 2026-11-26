# Administrative catalog

Migration `0001_catalog.sql` adds the following tables alongside the Phase 2 identity tables.

| Table                             | Responsibility                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `categories`                      | Unique slug, display order, editable name and description, archive flag                              |
| `measurement_definitions`         | Unique stable key, localized label and instructions, display unit, precision and canonical bounds    |
| `patterns`                        | Stable UUID, owner FK, creation and modification times, archive timestamp                            |
| `pattern_versions`                | Numbered content revision, lifecycle state, optimistic revision counter, category snapshot and price |
| `pattern_pieces`                  | Ordered and version-scoped piece IDs, cut quantity and construction details                          |
| `pattern_required_measurements`   | Ordered selected definitions, snapshots, optionality and per-pattern bounds                          |
| `pattern_size_variants`           | Ordered custom size labels, unique per version when named                                            |
| `pattern_size_measurement_ranges` | Exact range per size and selected measurement from the same version                                  |

UUIDs identify resources. Timestamps use PostgreSQL `timestamptz`. Lengths use integer micrometres. The interface converts decimal millimetres or centimetres without floating-point persistence. Prices use integer currency minor units. Accepted currency identifiers come from the runtime's ISO currency data. Plain text holds descriptions and instructions.

## Drafts and lifecycle

Create inserts one pattern and its first draft in a single transaction. The wizard's explicit save submits the draft version ID and revision. The service locks the stable pattern, checks permission and revision, then rewrites the small ordered child collections and records audit in the same transaction. Concurrent saves from the same revision result in one success and one conflict. Opening an edit route reloads the saved draft. The client warns when leaving with unsaved changes.

Drafts accept missing metadata but reject invalid supplied values. A snapshot captures category name and slug when a draft is saved. Measurement definitions are copied when first selected. Published snapshots remain unchanged if the source library changes. A draft can retain archived definitions it already references. New selections require active definitions. Categories and measurement definitions are archived rather than deleted.

A draft can become published only after the readiness, unambiguous sizing and asset checks pass. Phase 3 always reports missing validated documents and persists attempted and rejected audit events. PostgreSQL prevents changes to historical versions and their children. Starting an edit of published content creates a new numbered draft and copies the ordered children. The published version remains addressable by pattern ID and version number. Archiving a pattern sets its stable archive timestamp and preserves every version and its future entitlement references. An archived pattern cannot be edited, cloned or published. Future public queries must exclude archived identities and serve only published versions.

## Dynamic measurement and sizes

The measurement preview derives typed fields from selected definition snapshots and their overrides. Arbitrary names and quantities of garment pieces, measurements and size labels use the same wizard. The preview never submits or stores body measurements. Display ordering uses explicit positions with stable tie-breaking.

Phase 4 can evaluate a validated customer's canonical measurements against every configured size. Return all candidates that satisfy their bounds and let the customer choose when multiple sizes match. Preserve inclusive endpoints and expose overlaps. Incomplete data should not be used to invent a single recommendation. Phase 3 flags ambiguous overlaps among configured size intervals and never picks a size.

Phase 5 should attach validated private document assets to immutable version and size identifiers. Before enabling publication, verify each required document, lock the stable pattern, recheck the draft revision and readiness, and atomically record the published version and audit event. Keep submitted file names, presigned URLs and customer data out of audit. No file or image integration is active in Phase 3.

## API and runtime grants

Every route requires the existing verified ADMIN session and current MFA proof. The service also checks operation permissions and pattern ownership. DESIGNER has domain permission to create patterns and update owned drafts for a future workflow. The administrative page and API boundary remain ADMIN-only.

| Method    | Path under `/api/v1/admin` | Operation                                               |
| --------- | -------------------------- | ------------------------------------------------------- |
| GET, POST | `/categories`              | Search or create/update/archive categories              |
| GET, POST | `/measurements`            | Search or create/update/archive definitions             |
| GET, POST | `/patterns`                | Filter and page results, or create a draft              |
| GET, PUT  | `/patterns/[id]`           | Read or save the latest draft                           |
| POST      | `/patterns/[id]/versions`  | Archive, clone historical content, or check publication |

For a deployed database, apply these grants in addition to the identity grants. Keep the runtime login separate from the migration owner. In particular, runtime updates have no access to version publication state.

```sql
GRANT SELECT, INSERT, UPDATE ON categories, measurement_definitions TO verse_runtime;
GRANT SELECT, INSERT ON patterns, pattern_versions TO verse_runtime;
GRANT UPDATE (archived_at, updated_at) ON patterns TO verse_runtime;
GRANT UPDATE (name, slug, short, description, materials, instructions, category_id,
  category_name, category_slug, difficulty, price_kind, amount, currency,
  revision, updated_at) ON pattern_versions TO verse_runtime;
GRANT SELECT, INSERT, DELETE ON pattern_pieces, pattern_required_measurements,
  pattern_size_variants, pattern_size_measurement_ranges TO verse_runtime;
```

Pattern pages return up to 20 records with bounded offset paging. Library queries and wizard option lists return up to 500 rows per request. The wizard caps children at 50 pieces, 30 selected measurements and 30 sizes, with at most 30 ranges per size.
