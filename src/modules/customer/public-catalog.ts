import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  gt,
  notExists,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  fileAssets,
  patternWithdrawals,
  savedPatterns,
} from "../../infrastructure/database/file-schema";
import { z } from "zod";
import type { Database } from "../../infrastructure/database/connection";
import {
  categories,
  patterns,
  patternVersions,
  patternMeasurements,
  patternPieces,
  patternSizes,
  sizeRanges,
} from "../../infrastructure/database/catalog-schema";
import { difficulties, slug } from "../catalog/validation";
import type { MeasurementField, Size } from "./measurements";

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
export const catalogFilters = z.object({
  q: z.string().trim().max(100).default(""),
  category: optional(slug),
  difficulty: optional(z.enum(difficulties)),
  price: optional(z.enum(["FREE", "PREMIUM"])),
  sort: z.enum(["recent", "name"]).default("recent"),
  page: z
    .string()
    .regex(/^[1-9]\d{0,3}$/)
    .transform(Number)
    .pipe(z.number().max(1000))
    .prefault("1"),
});
export type CatalogFilters = z.output<typeof catalogFilters>;
const pageSize = 12;

const newer = alias(patternVersions, "newer_public_version");
function currentPublished(db: Pick<Database, "select">, now: Date) {
  return and(
    eq(patternVersions.state, "PUBLISHED"),
    isNotNull(patternVersions.publishedAt),
    lte(patternVersions.publishedAt, now),
    notExists(
      db
        .select({ id: newer.id })
        .from(newer)
        .where(
          and(
            eq(newer.patternId, patternVersions.patternId),
            eq(newer.state, "PUBLISHED"),
            gt(newer.number, patternVersions.number),
            lte(newer.publishedAt, now),
          ),
        ),
    ),
  );
}
const visible = (db: Pick<Database, "select">) =>
  and(
    currentPublished(db, new Date()),
    isNull(patterns.archivedAt),
    notExists(
      db
        .select({ id: patternWithdrawals.patternId })
        .from(patternWithdrawals)
        .where(eq(patternWithdrawals.patternId, patterns.id)),
    ),
    eq(categories.archived, false),
  );
const cover = alias(fileAssets, "published_cover");
const covers = and(
  eq(cover.versionId, patternVersions.id),
  eq(cover.status, "READY"),
  eq(cover.purpose, "COVER_IMAGE"),
);
const cardFields = {
  slug: patternVersions.slug,
  edition: patternVersions.number,
  coverId: cover.id,
  coverAlt: cover.alt,
  name: patternVersions.name,
  summary: patternVersions.short,
  category: patternVersions.categoryName,
  categorySlug: categories.slug,
  difficulty: patternVersions.difficulty,
  price: patternVersions.priceKind,
  amount: patternVersions.amount,
  currency: patternVersions.currency,
};
export type PatternCard = {
  coverId: string | null;
  coverAlt: string | null;
  edition: number;
  slug: string;
  name: string;
  summary: string;
  category: string | null;
  categorySlug: string;
  difficulty: (typeof difficulties)[number] | null;
  price: "FREE" | "PREMIUM";
  amount: number | null;
  currency: string | null;
};
export type PublicPattern = PatternCard & {
  description: string;
  materials: string;
  instructions: string;
  pieces: {
    name: string;
    description: string;
    quantity: number;
    fabric: string;
    fold: boolean;
    mirrored: boolean;
    grainline: string;
    seam: number | null;
  }[];
  fields: MeasurementField[];
  sizes: Size[];
  images: { id: string; alt: string }[];
  downloads: { sizeId: string; pages: number | null }[];
};

const publicQuery = (db: Pick<Database, "select">) =>
  db
    .select(cardFields)
    .from(patternVersions)
    .innerJoin(patterns, eq(patternVersions.patternId, patterns.id))
    .innerJoin(categories, eq(patternVersions.categoryId, categories.id))
    .leftJoin(cover, covers);
const search = (value: string) => "%" + value.replace(/[\\%_]/g, "\\$&") + "%";

export async function publishedPatterns(db: Database, filters: CatalogFilters) {
  const rows = await publicQuery(db)
    .where(
      and(
        visible(db),
        filters.category ? eq(categories.slug, filters.category) : undefined,
        filters.difficulty
          ? eq(patternVersions.difficulty, filters.difficulty)
          : undefined,
        filters.price
          ? eq(patternVersions.priceKind, filters.price)
          : undefined,
        filters.q
          ? or(
              ilike(patternVersions.name, search(filters.q)),
              ilike(patternVersions.short, search(filters.q)),
            )
          : undefined,
      ),
    )
    .orderBy(
      filters.sort === "name"
        ? asc(patternVersions.name)
        : desc(patternVersions.publishedAt),
      asc(patternVersions.slug),
    )
    .limit(pageSize + 1)
    .offset((filters.page - 1) * pageSize);
  return { rows: rows.slice(0, pageSize), next: rows.length > pageSize };
}

export async function publicCategories(db: Database, selected?: string) {
  return db
    .select({
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      count: sql<number>`count(${patterns.id})::int`,
    })
    .from(categories)
    .leftJoin(
      patternVersions,
      and(
        eq(patternVersions.categoryId, categories.id),
        currentPublished(db, new Date()),
      ),
    )
    .leftJoin(
      patterns,
      and(
        eq(patterns.id, patternVersions.patternId),
        isNull(patterns.archivedAt),
        notExists(
          db
            .select({ id: patternWithdrawals.patternId })
            .from(patternWithdrawals)
            .where(eq(patternWithdrawals.patternId, patterns.id)),
        ),
      ),
    )
    .where(
      and(
        eq(categories.archived, false),
        selected ? eq(categories.slug, selected) : undefined,
      ),
    )
    .groupBy(categories.id)
    .orderBy(
      asc(categories.position),
      asc(categories.name),
      asc(categories.slug),
    )
    .limit(selected ? 1 : 500);
}

export async function publishedPattern(
  db: Database,
  path: string,
): Promise<PublicPattern | undefined> {
  if (!slug.safeParse(path).success) return;
  return db.transaction(
    async (tx) => {
      const [row] = await tx
        .select({
          ...cardFields,
          id: patternVersions.id,
          description: patternVersions.description,
          materials: patternVersions.materials,
          instructions: patternVersions.instructions,
        })
        .from(patternVersions)
        .innerJoin(patterns, eq(patternVersions.patternId, patterns.id))
        .innerJoin(categories, eq(patternVersions.categoryId, categories.id))
        .leftJoin(cover, covers)
        .where(and(visible(tx), eq(patternVersions.slug, path)))
        .limit(1);
      if (!row) return;
      const { id, ...data } = row;
      const pieces = await tx
        .select({
          name: patternPieces.name,
          description: patternPieces.description,
          quantity: patternPieces.quantity,
          fabric: patternPieces.fabric,
          fold: patternPieces.fold,
          mirrored: patternPieces.mirrored,
          grainline: patternPieces.grainline,
          seam: patternPieces.seam,
        })
        .from(patternPieces)
        .where(eq(patternPieces.versionId, id))
        .orderBy(asc(patternPieces.position));
      const fields = await tx
        .select({
          id: patternMeasurements.definitionId,
          key: patternMeasurements.key,
          name: patternMeasurements.name,
          description: patternMeasurements.description,
          instructions: patternMeasurements.instructions,
          unit: patternMeasurements.unit,
          precision: patternMeasurements.precision,
          required: patternMeasurements.required,
          min: sql<number>`coalesce(${patternMeasurements.min}, ${patternMeasurements.defaultMin})`,
          max: sql<number>`coalesce(${patternMeasurements.max}, ${patternMeasurements.defaultMax})`,
        })
        .from(patternMeasurements)
        .where(eq(patternMeasurements.versionId, id))
        .orderBy(asc(patternMeasurements.position));
      const sizes = await tx
        .select({ id: patternSizes.id, label: patternSizes.label })
        .from(patternSizes)
        .where(eq(patternSizes.versionId, id))
        .orderBy(asc(patternSizes.position));
      const ranges = sizes.length
        ? await tx
            .select({
              sizeId: sizeRanges.sizeId,
              definitionId: sizeRanges.definitionId,
              min: sizeRanges.min,
              max: sizeRanges.max,
            })
            .from(sizeRanges)
            .where(
              and(
                eq(sizeRanges.versionId, id),
                inArray(
                  sizeRanges.sizeId,
                  sizes.map((v) => v.id),
                ),
              ),
            )
        : [];
      const images = await tx
        .select({ id: fileAssets.id, alt: fileAssets.alt })
        .from(fileAssets)
        .where(
          and(
            eq(fileAssets.versionId, id),
            eq(fileAssets.status, "READY"),
            inArray(fileAssets.purpose, [
              "GALLERY_IMAGE",
              "PATTERN_PREVIEW",
              "MEASUREMENT_ILLUSTRATION",
            ]),
          ),
        )
        .orderBy(asc(fileAssets.position), asc(fileAssets.id));
      const assets =
        row.price === "FREE"
          ? await tx
              .select({ sizeId: fileAssets.sizeId, pages: fileAssets.pages })
              .from(fileAssets)
              .where(
                and(
                  eq(fileAssets.versionId, id),
                  eq(fileAssets.status, "READY"),
                  eq(fileAssets.purpose, "PATTERN_A4_PDF"),
                ),
              )
          : [];
      const downloads = assets.flatMap(({ sizeId, pages }) =>
        sizeId ? [{ sizeId, pages }] : [],
      );
      return {
        ...data,
        images,
        downloads,
        pieces,
        fields,
        sizes: sizes.map((v) => ({
          ...v,
          ranges: ranges
            .filter((r) => r.sizeId === v.id)
            .map(({ definitionId, min, max }) => ({ definitionId, min, max })),
        })),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function discoverableSlugs(db: Database) {
  return db
    .select({ slug: patternVersions.slug })
    .from(patternVersions)
    .innerJoin(patterns, eq(patternVersions.patternId, patterns.id))
    .innerJoin(categories, eq(patternVersions.categoryId, categories.id))
    .where(visible(db))
    .orderBy(asc(patternVersions.slug))
    .limit(10000);
}

export async function publishedDefinitions(
  db: Pick<Database, "select" | "selectDistinctOn">,
  ids?: string[],
): Promise<MeasurementField[]> {
  const fields = db
    .selectDistinctOn([patternMeasurements.definitionId], {
      id: patternMeasurements.definitionId,
      key: patternMeasurements.key,
      name: patternMeasurements.name,
      description: patternMeasurements.description,
      instructions: patternMeasurements.instructions,
      unit: patternMeasurements.unit,
      precision: patternMeasurements.precision,
      min: patternMeasurements.defaultMin,
      max: patternMeasurements.defaultMax,
    })
    .from(patternMeasurements)
    .innerJoin(
      patternVersions,
      eq(patternMeasurements.versionId, patternVersions.id),
    )
    .innerJoin(patterns, eq(patternVersions.patternId, patterns.id))
    .innerJoin(categories, eq(patternVersions.categoryId, categories.id))
    .where(
      and(
        visible(db),
        ids ? inArray(patternMeasurements.definitionId, ids) : undefined,
      ),
    )
    .orderBy(
      asc(patternMeasurements.definitionId),
      desc(patternVersions.publishedAt),
      asc(patternVersions.id),
    )
    .as("published_measurement_fields");
  const rows = await db
    .select()
    .from(fields)
    .orderBy(asc(fields.name), asc(fields.id))
    .limit(500);
  return rows.map((row) => ({ ...row, required: false }));
}

export async function publicEdition(db: Database, key: string) {
  const [entry] = await db
    .select({
      id: patternVersions.id,
      patternId: patterns.id,
      edition: patternVersions.number,
      price: patternVersions.priceKind,
      state: patternVersions.state,
    })
    .from(patternVersions)
    .innerJoin(patterns, eq(patternVersions.patternId, patterns.id))
    .innerJoin(categories, eq(patternVersions.categoryId, categories.id))
    .where(and(visible(db), eq(patternVersions.slug, key)))
    .limit(1);
  return entry;
}

export async function libraryPatterns(db: Database, owner: string) {
  return db
    .select({
      id: patterns.id,
      slug: patternVersions.slug,
      name: patternVersions.name,
    })
    .from(savedPatterns)
    .innerJoin(patterns, eq(patterns.id, savedPatterns.patternId))
    .innerJoin(patternVersions, eq(patternVersions.patternId, patterns.id))
    .innerJoin(categories, eq(patternVersions.categoryId, categories.id))
    .where(
      and(
        visible(db),
        eq(savedPatterns.userId, owner),
        eq(patternVersions.priceKind, "FREE"),
        exists(
          db
            .select({ id: fileAssets.id })
            .from(fileAssets)
            .where(
              and(
                eq(fileAssets.versionId, patternVersions.id),
                eq(fileAssets.status, "READY"),
                eq(fileAssets.purpose, "PATTERN_A4_PDF"),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(savedPatterns.createdAt), asc(patterns.id))
    .limit(100);
}
