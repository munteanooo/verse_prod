import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./schema";

const time = (key: string) => timestamp(key, { withTimezone: true });
const updated = () => time("updated_at").notNull().defaultNow();
export const publicationState = pgEnum("publication_state", [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
]);
export const lengthUnit = pgEnum("pattern_length_unit", ["mm", "cm"]);
export const difficulty = pgEnum("pattern_difficulty", [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
]);
export const priceKind = pgEnum("pattern_price_kind", ["FREE", "PREMIUM"]);

export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    description: text().notNull(),
    position: integer().notNull(),
    archived: boolean().notNull().default(false),
    updatedAt: updated(),
  },
  (t) => [
    index("categories_order_idx").on(t.position, t.id),
    check("category_order_positive", sql`${t.position} >= 0`),
  ],
);

export const measurementDefinitions = pgTable(
  "measurement_definitions",
  {
    id: uuid().primaryKey().defaultRandom(),
    key: text().notNull().unique(),
    name: text().notNull(),
    description: text().notNull(),
    instructions: text().notNull(),
    unit: lengthUnit().notNull(),
    precision: integer(),
    min: integer().notNull(),
    max: integer().notNull(),
    archived: boolean().notNull().default(false),
    updatedAt: updated(),
  },
  (t) => [
    check(
      "definition_bounds",
      sql`${t.min} >= 0 and ${t.max} >= ${t.min} and ${t.max} <= 10000000`,
    ),
    check("definition_precision", sql`${t.precision} between 0 and 3`),
    index("measurement_name_idx").on(t.name, t.id),
  ],
);

export const patterns = pgTable(
  "patterns",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    archivedAt: time("archived_at"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: updated(),
  },
  (t) => [
    index("patterns_owner_idx").on(t.ownerId),
    index("patterns_updated_idx").on(t.updatedAt, t.id),
  ],
);

export const patternVersions = pgTable(
  "pattern_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => patterns.id, { onDelete: "restrict" }),
    number: integer().notNull(),
    revision: integer().notNull().default(0),
    state: publicationState().notNull().default("DRAFT"),
    name: text().notNull().default(""),
    slug: text().notNull().default(""),
    short: text().notNull().default(""),
    description: text().notNull().default(""),
    materials: text().notNull().default(""),
    instructions: text().notNull().default(""),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "restrict",
    }),
    categoryName: text("category_name"),
    categorySlug: text("category_slug"),
    difficulty: difficulty(),
    priceKind: priceKind("price_kind").notNull().default("FREE"),
    amount: integer(),
    currency: text(),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: updated(),
    publishedAt: time("published_at"),
  },
  (t) => [
    unique().on(t.patternId, t.number),
    uniqueIndex("one_draft_per_pattern")
      .on(t.patternId)
      .where(sql`${t.state} = 'DRAFT'`),
    uniqueIndex("published_pattern_slug")
      .on(t.slug)
      .where(sql`${t.state} = 'PUBLISHED'`),
    index("versions_category_idx").on(t.categoryId),
    index("versions_state_idx").on(t.state),
    check(
      "version_numbers_positive",
      sql`${t.number} > 0 and ${t.revision} >= 0`,
    ),
    check(
      "version_price",
      sql`(${t.amount} is null or ${t.amount} > 0) and (${t.currency} is null or ${t.currency} ~ '^[A-Z]{3}$') and (${t.priceKind} <> 'FREE' or (${t.amount} is null and ${t.currency} is null))`,
    ),
  ],
);

const versionReference = () =>
  uuid("version_id")
    .notNull()
    .references(() => patternVersions.id, { onDelete: "restrict" });
export const patternPieces = pgTable(
  "pattern_pieces",
  {
    versionId: versionReference(),
    id: uuid().notNull(),
    position: integer().notNull(),
    name: text().notNull(),
    description: text().notNull(),
    quantity: integer().notNull(),
    fabric: text().notNull(),
    fold: boolean().notNull(),
    mirrored: boolean().notNull(),
    grainline: text().notNull(),
    seam: integer(),
  },
  (t) => [
    primaryKey({ columns: [t.versionId, t.id] }),
    unique().on(t.versionId, t.position),
    check(
      "piece_limits",
      sql`${t.position} >= 0 and ${t.quantity} between 1 and 100 and (${t.seam} is null or ${t.seam} between 0 and 10000000)`,
    ),
  ],
);

export const patternMeasurements = pgTable(
  "pattern_required_measurements",
  {
    versionId: versionReference(),
    definitionId: uuid("definition_id").notNull(),
    position: integer().notNull(),
    required: boolean().notNull(),
    min: integer(),
    max: integer(),
    key: text().notNull(),
    name: text().notNull(),
    description: text().notNull(),
    instructions: text().notNull(),
    unit: lengthUnit().notNull(),
    precision: integer(),
    defaultMin: integer("default_min").notNull(),
    defaultMax: integer("default_max").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.versionId, t.definitionId] }),
    unique().on(t.versionId, t.position),
    index("required_definition_idx").on(t.definitionId),
    foreignKey({
      name: "required_measurement_definition_fk",
      columns: [t.definitionId],
      foreignColumns: [measurementDefinitions.id],
    }).onDelete("restrict"),
    check(
      "required_measurement_bounds",
      sql`coalesce(${t.min}, ${t.defaultMin}) >= ${t.defaultMin} and coalesce(${t.max}, ${t.defaultMax}) <= ${t.defaultMax} and coalesce(${t.min}, ${t.defaultMin}) <= coalesce(${t.max}, ${t.defaultMax})`,
    ),
  ],
);

export const patternSizes = pgTable(
  "pattern_size_variants",
  {
    versionId: versionReference(),
    id: uuid().notNull(),
    position: integer().notNull(),
    label: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.versionId, t.id] }),
    unique().on(t.versionId, t.position),
    uniqueIndex("size_label_per_version")
      .on(t.versionId, sql`lower(${t.label})`)
      .where(sql`${t.label} <> ''`),
  ],
);

export const sizeRanges = pgTable(
  "pattern_size_measurement_ranges",
  {
    versionId: uuid("version_id").notNull(),
    sizeId: uuid("size_id").notNull(),
    definitionId: uuid("definition_id").notNull(),
    min: integer().notNull(),
    max: integer().notNull(),
  },
  (t) => [
    primaryKey({
      name: "size_ranges_pk",
      columns: [t.versionId, t.sizeId, t.definitionId],
    }),
    foreignKey({
      name: "size_ranges_variant_fk",
      columns: [t.versionId, t.sizeId],
      foreignColumns: [patternSizes.versionId, patternSizes.id],
    }),
    foreignKey({
      name: "size_ranges_measurement_fk",
      columns: [t.versionId, t.definitionId],
      foreignColumns: [
        patternMeasurements.versionId,
        patternMeasurements.definitionId,
      ],
    }),
    index("size_ranges_definition_idx").on(t.versionId, t.definitionId),
    check(
      "size_range_bounds",
      sql`${t.min} >= 0 and ${t.max} >= ${t.min} and ${t.max} <= 10000000`,
    ),
  ],
);
