import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../infrastructure/database/connection";
import {
  categories,
  measurementDefinitions,
  patternMeasurements,
  patternPieces,
  patterns,
  patternSizes,
  patternVersions,
  sizeRanges,
} from "../../infrastructure/database/catalog-schema";
import { user } from "../../infrastructure/database/schema";
import { recordAudit } from "../identity/audit";
import { can, type Permission, type Role } from "../identity/policy";
import { mayEdit, publicationDecision } from "./lifecycle";
import {
  categoryInput,
  draftInput,
  id,
  measurementInput,
  states,
  type Definition,
  type Draft,
} from "./validation";

export type CatalogActor = { id: string; role: Role };
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DetailReader = Pick<Database, "select">;
export const pageSize = 20;

export class CatalogError extends Error {
  constructor(
    public code: "forbidden" | "missing" | "conflict" | "invalid" | "duplicate",
    public issues: string[] = [],
  ) {
    super(code);
  }
}

function checkPermission(actor: CatalogActor, permission: Permission) {
  if (!can(actor.role, permission)) throw new CatalogError("forbidden");
}

function editPermission(actor: CatalogActor, ownerId: string) {
  if (!mayEdit(actor.role, actor.id, ownerId))
    throw new CatalogError("forbidden");
}

const searchTerm = (query: string) =>
  "%" + query.replace(/[\\%_]/g, "\\$&") + "%";

export async function listCategories(db: Database, query = "", active = false) {
  return db
    .select()
    .from(categories)
    .where(
      and(
        query
          ? or(
              ilike(categories.name, searchTerm(query)),
              ilike(categories.slug, searchTerm(query)),
            )
          : undefined,
        active ? eq(categories.archived, false) : undefined,
      ),
    )
    .orderBy(asc(categories.position), asc(categories.name), asc(categories.id))
    .limit(500);
}

export async function listDefinitions(
  db: Database,
  query = "",
  active = false,
) {
  return db
    .select()
    .from(measurementDefinitions)
    .where(
      and(
        query
          ? or(
              ilike(measurementDefinitions.name, searchTerm(query)),
              ilike(measurementDefinitions.key, searchTerm(query)),
            )
          : undefined,
        active ? eq(measurementDefinitions.archived, false) : undefined,
      ),
    )
    .orderBy(asc(measurementDefinitions.name), asc(measurementDefinitions.id))
    .limit(500);
}

export const libraryMutation = z.object({
  id: id.optional(),
  value: z.unknown(),
});
export async function saveLibrary(
  db: Database,
  actor: CatalogActor,
  library: "categories" | "measurements",
  payload: unknown,
) {
  checkPermission(
    actor,
    library === "categories" ? "category:manage" : "measurement:manage",
  );
  const input = libraryMutation.parse(payload);
  return db.transaction(async (tx) => {
    let saved: { id: string; archived: boolean } | undefined;
    let wasArchived = false;
    if (library === "categories") {
      const value = categoryInput.parse(input.value);
      if (input.id) {
        const [before] = await tx
          .select()
          .from(categories)
          .where(eq(categories.id, input.id))
          .for("update");
        if (!before) throw new CatalogError("missing");
        wasArchived = before.archived;
        [saved] = await tx
          .update(categories)
          .set({ ...value, updatedAt: new Date() })
          .where(eq(categories.id, input.id))
          .returning();
      } else [saved] = await tx.insert(categories).values(value).returning();
    } else {
      const value = measurementInput.parse(input.value);
      if (input.id) {
        const [before] = await tx
          .select()
          .from(measurementDefinitions)
          .where(eq(measurementDefinitions.id, input.id))
          .for("update");
        if (!before) throw new CatalogError("missing");
        if (before.key !== value.key)
          throw new CatalogError("invalid", ["key"]);
        wasArchived = before.archived;
        [saved] = await tx
          .update(measurementDefinitions)
          .set({ ...value, updatedAt: new Date() })
          .where(eq(measurementDefinitions.id, input.id))
          .returning();
      } else
        [saved] = await tx
          .insert(measurementDefinitions)
          .values(value)
          .returning();
    }
    if (!saved) throw new CatalogError("missing");
    const resourceType = library === "categories" ? "category" : "measurement";
    const change = !input.id
      ? "created"
      : saved.archived && !wasArchived
        ? "archived"
        : "updated";
    await recordAudit(tx, {
      actorId: actor.id,
      action: resourceType + "." + change,
      resourceType,
      resourceId: saved.id,
    });
    return saved;
  });
}

export const patternFilters = z.object({
  q: z.string().trim().max(100).default(""),
  category: z.preprocess(
    (value) => (value === "" ? undefined : value),
    id.optional(),
  ),
  state: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(states).optional(),
  ),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export async function listPatterns(
  db: Database,
  actor: CatalogActor,
  filters: z.infer<typeof patternFilters>,
) {
  checkPermission(actor, "admin:access");
  const latest = db
    .select({
      id: patternVersions.id,
      patternId: patternVersions.patternId,
      name: patternVersions.name,
      slug: patternVersions.slug,
      number: patternVersions.number,
      state: patternVersions.state,
      categoryId: patternVersions.categoryId,
      categoryName: patternVersions.categoryName,
    })
    .from(patternVersions)
    .where(eq(patternVersions.patternId, patterns.id))
    .orderBy(desc(patternVersions.number))
    .limit(1)
    .as("latest");
  const rows = await db
    .select({
      id: patterns.id,
      updatedAt: patterns.updatedAt,
      archivedAt: patterns.archivedAt,
      owner: user.name,
      name: latest.name,
      slug: latest.slug,
      state: latest.state,
      number: latest.number,
      category: latest.categoryName,
    })
    .from(patterns)
    .innerJoin(user, eq(user.id, patterns.ownerId))
    .innerJoinLateral(latest, sql`true`)
    .where(
      and(
        filters.state === "ARCHIVED"
          ? or(isNotNull(patterns.archivedAt), eq(latest.state, "ARCHIVED"))
          : filters.state
            ? and(isNull(patterns.archivedAt), eq(latest.state, filters.state))
            : undefined,
        filters.category ? eq(latest.categoryId, filters.category) : undefined,
        filters.q
          ? or(
              ilike(latest.name, searchTerm(filters.q)),
              ilike(latest.slug, searchTerm(filters.q)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(patterns.updatedAt), desc(patterns.id))
    .limit(pageSize + 1)
    .offset((filters.page - 1) * pageSize);
  return { rows: rows.slice(0, pageSize), next: rows.length > pageSize };
}

export async function createPattern(db: Database, actor: CatalogActor) {
  checkPermission(actor, "pattern:create");
  return db.transaction(async (tx) => {
    const [pattern] = await tx
      .insert(patterns)
      .values({ ownerId: actor.id })
      .returning();
    await tx
      .insert(patternVersions)
      .values({ patternId: pattern.id, number: 1 });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "pattern.created",
      resourceType: "pattern",
      resourceId: pattern.id,
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "pattern.version.created",
      resourceType: "pattern",
      resourceId: pattern.id,
      metadata: { number: 1 },
    });
    return pattern;
  });
}

async function latestVersion(db: DetailReader, patternId: string) {
  const [latest] = await db
    .select()
    .from(patternVersions)
    .where(eq(patternVersions.patternId, patternId))
    .orderBy(desc(patternVersions.number))
    .limit(1);
  if (!latest) throw new CatalogError("missing");
  return latest;
}

async function details(
  db: DetailReader,
  version: typeof patternVersions.$inferSelect,
) {
  const versionId = version.id;
  const pieces = await db
    .select()
    .from(patternPieces)
    .where(eq(patternPieces.versionId, versionId))
    .orderBy(asc(patternPieces.position));
  const measurements = await db
    .select()
    .from(patternMeasurements)
    .where(eq(patternMeasurements.versionId, versionId))
    .orderBy(asc(patternMeasurements.position));
  const variants = await db
    .select()
    .from(patternSizes)
    .where(eq(patternSizes.versionId, versionId))
    .orderBy(asc(patternSizes.position));
  const ranges = await db
    .select()
    .from(sizeRanges)
    .where(eq(sizeRanges.versionId, versionId))
    .orderBy(asc(sizeRanges.definitionId));
  const definitions: Definition[] = measurements.map((m) => ({
    ...m,
    id: m.definitionId,
    min: m.defaultMin,
    max: m.defaultMax,
    archived: false,
  }));
  const draft = draftInput.parse({
    ...version,
    pricing: {
      kind: version.priceKind,
      amount: version.amount,
      currency: version.currency,
    },
    pieces,
    measurements,
    variants: variants.map((v) => ({
      ...v,
      ranges: ranges.filter((r) => r.sizeId === v.id),
    })),
  });
  return { draft, definitions };
}

export async function readPattern(
  db: Database,
  actor: CatalogActor,
  patternId: string,
  number?: number,
) {
  return db.transaction(
    async (tx) => {
      const [pattern] = await tx
        .select()
        .from(patterns)
        .where(eq(patterns.id, patternId));
      if (!pattern) throw new CatalogError("missing");
      editPermission(actor, pattern.ownerId);
      const version =
        number === undefined
          ? await latestVersion(tx, patternId)
          : (
              await tx
                .select()
                .from(patternVersions)
                .where(
                  and(
                    eq(patternVersions.patternId, patternId),
                    eq(patternVersions.number, number),
                  ),
                )
            )[0];
      if (!version) throw new CatalogError("missing");
      const category = version.categoryId
        ? (
            await tx
              .select()
              .from(categories)
              .where(eq(categories.id, version.categoryId))
          )[0]
        : undefined;
      const versions = await tx
        .select({
          id: patternVersions.id,
          number: patternVersions.number,
          state: patternVersions.state,
          updatedAt: patternVersions.updatedAt,
        })
        .from(patternVersions)
        .where(eq(patternVersions.patternId, patternId))
        .orderBy(desc(patternVersions.number))
        .limit(100);
      return {
        pattern,
        version,
        versions,
        category,
        ...(await details(tx, version)),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function lockPattern(tx: Tx, patternId: string) {
  const [pattern] = await tx
    .select()
    .from(patterns)
    .where(eq(patterns.id, patternId))
    .for("update");
  if (!pattern) throw new CatalogError("missing");
  if (pattern.archivedAt) throw new CatalogError("conflict");
  return pattern;
}

async function replaceRelations(
  tx: Tx,
  versionId: string,
  draft: Draft,
  definitions: Definition[],
) {
  await tx.delete(sizeRanges).where(eq(sizeRanges.versionId, versionId));
  await tx.delete(patternSizes).where(eq(patternSizes.versionId, versionId));
  await tx
    .delete(patternMeasurements)
    .where(eq(patternMeasurements.versionId, versionId));
  await tx.delete(patternPieces).where(eq(patternPieces.versionId, versionId));
  if (draft.pieces.length)
    await tx.insert(patternPieces).values(
      draft.pieces.map((piece, position) => ({
        ...piece,
        position,
        versionId,
      })),
    );
  if (draft.measurements.length)
    await tx.insert(patternMeasurements).values(
      draft.measurements.map((m, position) => {
        const d = definitions.find(({ id }) => m.definitionId === id);
        if (!d) throw new CatalogError("invalid", ["measurements"]);
        const min = m.min ?? d.min,
          max = m.max ?? d.max;
        if (min < d.min || max > d.max || min > max)
          throw new CatalogError("invalid", ["measurements"]);
        if (
          draft.variants.some((v) =>
            v.ranges.some(
              (r) => r.definitionId === d.id && (r.min < min || r.max > max),
            ),
          )
        )
          throw new CatalogError("invalid", ["variants"]);
        return {
          ...m,
          position,
          versionId,
          key: d.key,
          name: d.name,
          description: d.description,
          instructions: d.instructions,
          unit: d.unit,
          precision: d.precision,
          defaultMin: d.min,
          defaultMax: d.max,
        };
      }),
    );
  if (draft.variants.length)
    await tx.insert(patternSizes).values(
      draft.variants.map(({ id, label }, position) => ({
        id,
        label,
        position,
        versionId,
      })),
    );
  const ranges = draft.variants.flatMap((v) =>
    v.ranges.map((range) => ({ ...range, versionId, sizeId: v.id })),
  );
  if (ranges.length) await tx.insert(sizeRanges).values(ranges);
}

export const saveRequest = z.object({
  versionId: id,
  revision: z.number().int().min(0).max(2_147_483_646),
  draft: draftInput,
});
export async function saveDraft(
  db: Database,
  actor: CatalogActor,
  patternId: string,
  payload: unknown,
) {
  const input = saveRequest.parse(payload);
  return db.transaction(async (tx) => {
    const pattern = await lockPattern(tx, patternId);
    editPermission(actor, pattern.ownerId);
    const version = await latestVersion(tx, patternId);
    if (
      version.id !== input.versionId ||
      version.revision !== input.revision ||
      version.state !== "DRAFT"
    )
      throw new CatalogError("conflict");
    const { draft } = input;
    const category = draft.categoryId
      ? (
          await tx
            .select()
            .from(categories)
            .where(eq(categories.id, draft.categoryId))
        )[0]
      : undefined;
    if (
      draft.categoryId &&
      (!category ||
        (category.archived && draft.categoryId !== version.categoryId))
    )
      throw new CatalogError("invalid", ["categoryId"]);
    const previous = (await details(tx, version)).definitions;
    const newIds = draft.measurements
      .map((m) => m.definitionId)
      .filter((id) => !previous.some((d) => d.id === id));
    const added = newIds.length
      ? await tx
          .select()
          .from(measurementDefinitions)
          .where(
            and(
              inArray(measurementDefinitions.id, newIds),
              eq(measurementDefinitions.archived, false),
            ),
          )
      : [];
    const {
      name,
      slug,
      short,
      description,
      categoryId,
      difficulty,
      materials,
      instructions,
      pricing,
    } = draft;
    const [saved] = await tx
      .update(patternVersions)
      .set({
        name,
        slug,
        short,
        description,
        categoryId,
        difficulty,
        materials,
        instructions,
        priceKind: pricing.kind,
        amount: pricing.amount,
        currency: pricing.currency,
        categoryName: category?.name ?? null,
        categorySlug: category?.slug ?? null,
        revision: version.revision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(patternVersions.id, version.id),
          eq(patternVersions.revision, input.revision),
        ),
      )
      .returning();
    if (!saved) throw new CatalogError("conflict");
    await replaceRelations(tx, version.id, draft, [...previous, ...added]);
    await tx
      .update(patterns)
      .set({ updatedAt: saved.updatedAt })
      .where(eq(patterns.id, patternId));
    await recordAudit(tx, {
      actorId: actor.id,
      action: "pattern.draft.updated",
      resourceType: "pattern",
      resourceId: patternId,
      metadata: { number: saved.number, revision: saved.revision },
    });
    return saved;
  });
}

export async function patternAction(
  db: Database,
  actor: CatalogActor,
  patternId: string,
  action: "archive" | "publish" | "new-version",
) {
  if (action !== "new-version")
    checkPermission(
      actor,
      action === "archive" ? "pattern:archive" : "pattern:publish",
    );
  return db.transaction(async (tx) => {
    const pattern = await lockPattern(tx, patternId);
    editPermission(actor, pattern.ownerId);
    const version = await latestVersion(tx, patternId);
    if (action === "archive") {
      await tx
        .update(patterns)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(patterns.id, patternId));
      await recordAudit(tx, {
        actorId: actor.id,
        action: "pattern.archived",
        resourceType: "pattern",
        resourceId: patternId,
      });
      return { archived: true };
    }
    const { draft, definitions } = await details(tx, version);
    if (action === "new-version") {
      if (actor.role !== "ADMIN") throw new CatalogError("forbidden");
      if (version.state === "DRAFT") throw new CatalogError("conflict");
      const {
        name,
        slug,
        short,
        description,
        materials,
        instructions,
        categoryId,
        categoryName,
        categorySlug,
        difficulty,
        priceKind,
        amount,
        currency,
      } = version;
      const [next] = await tx
        .insert(patternVersions)
        .values({
          patternId,
          number: version.number + 1,
          name,
          slug,
          short,
          description,
          materials,
          instructions,
          categoryId,
          categoryName,
          categorySlug,
          difficulty,
          priceKind,
          amount,
          currency,
        })
        .returning();
      await replaceRelations(tx, next.id, draft, definitions);
      await tx
        .update(patterns)
        .set({ updatedAt: next.updatedAt })
        .where(eq(patterns.id, patternId));
      await recordAudit(tx, {
        actorId: actor.id,
        action: "pattern.version.created",
        resourceType: "pattern",
        resourceId: patternId,
        metadata: { number: next.number },
      });
      return { versionId: next.id };
    }
    const category = version.categoryId
      ? (
          await tx
            .select()
            .from(categories)
            .where(eq(categories.id, version.categoryId))
        )[0]
      : undefined;
    const decision = publicationDecision(
      draft,
      version.state,
      Boolean(category && !category.archived),
      false,
    );
    await recordAudit(tx, {
      actorId: actor.id,
      action: "publication.attempted",
      resourceType: "pattern",
      resourceId: patternId,
      metadata: { number: version.number },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "publication.rejected",
      resourceType: "pattern",
      resourceId: patternId,
      metadata: {
        reason: "documents-unavailable",
        transition: decision.transition,
        overlapping: decision.overlap.length > 0,
      },
    });
    return { rejected: true, ...decision };
  });
}
