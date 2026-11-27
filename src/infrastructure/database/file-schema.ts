import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  patternMeasurements,
  patternPieces,
  patterns,
  patternSizes,
  patternVersions,
} from "./catalog-schema";
import { user } from "./schema";
import { purposes } from "../../modules/documents/types";
import type { Geometry } from "../documents/pdf-worker";

const time = (key: string) => timestamp(key, { withTimezone: true });
export const assetPurpose = pgEnum("file_purpose", purposes);
export const assetStatus = pgEnum("file_status", [
  "PENDING",
  "VALIDATED",
  "READY",
  "REJECTED",
  "REMOVED",
]);
export const pdfMode = pgEnum("pdf_mode", ["A4", "FULL"]);

export const fileAssets = pgTable(
  "file_assets",
  {
    id: uuid().primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => patternVersions.id, { onDelete: "restrict" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    sizeId: uuid("size_id"),
    pieceId: uuid("piece_id"),
    definitionId: uuid("definition_id"),
    provider: text().notNull(),
    objectKey: text("object_key").unique(),
    filename: text().notNull(),
    bytes: integer().notNull(),
    checksum: text().notNull(),
    mediaType: text("media_type"),
    purpose: assetPurpose().notNull(),
    status: assetStatus().notNull().default("PENDING"),
    alt: text().notNull().default(""),
    position: integer().notNull().default(0),
    mode: pdfMode(),
    geometry: jsonb().$type<Geometry[]>(),
    overview: jsonb().$type<string[]>(),
    pages: integer(),
    revision: integer(),
    reason: text(),
    confirmedAt: time("confirmed_at"),
    scaleReference: text("scale_reference"),
    expiresAt: time("expires_at"),
    createdAt: time("created_at").notNull().defaultNow(),
    cleanedAt: time("cleaned_at"),
  },
  (t) => [
    foreignKey({
      name: "file_assets_size_fk",
      columns: [t.versionId, t.sizeId],
      foreignColumns: [patternSizes.versionId, patternSizes.id],
    }),
    foreignKey({
      name: "file_assets_piece_fk",
      columns: [t.versionId, t.pieceId],
      foreignColumns: [patternPieces.versionId, patternPieces.id],
    }),
    foreignKey({
      name: "file_assets_measurement_fk",
      columns: [t.versionId, t.definitionId],
      foreignColumns: [
        patternMeasurements.versionId,
        patternMeasurements.definitionId,
      ],
    }),
    index("file_assets_version_idx").on(t.versionId, t.purpose, t.position),
    index("file_cleanup_idx").on(t.status, t.expiresAt),
    uniqueIndex("file_cover_ready")
      .on(t.versionId)
      .where(sql`${t.purpose} = 'COVER_IMAGE' AND ${t.status} = 'READY'`),
    uniqueIndex("file_print_ready")
      .on(t.versionId, t.sizeId)
      .where(sql`${t.purpose} = 'PATTERN_A4_PDF' AND ${t.status} = 'READY'`),
    check(
      "file_asset_size",
      sql`${t.bytes} > 0 and ${t.position} >= 0 and ${t.checksum} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const documentJobs = pgTable(
  "document_processing_jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => patternVersions.id, { onDelete: "restrict" }),
    sizeId: uuid("size_id").notNull(),
    status: text().notNull().default("PROCESSING"),
    reason: text(),
    startedAt: time("started_at").notNull().defaultNow(),
    expiresAt: time("expires_at").notNull(),
  },
  (t) => [
    index("document_jobs_active_idx").on(t.status, t.expiresAt),
    check(
      "document_job_status",
      sql`${t.status} in ('PROCESSING', 'READY', 'FAILED')`,
    ),
  ],
);

// Withdrawal is separate from immutable published versions.
export const patternWithdrawals = pgTable("pattern_withdrawals", {
  patternId: uuid("pattern_id")
    .primaryKey()
    .references(() => patterns.id, { onDelete: "restrict" }),
  withdrawnAt: time("withdrawn_at").notNull().defaultNow(),
});

export const savedPatterns = pgTable(
  "saved_patterns",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => patterns.id, { onDelete: "restrict" }),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("saved_patterns_owner_pattern").on(t.userId, t.patternId),
  ],
);
