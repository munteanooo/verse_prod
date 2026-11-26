import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, expect, it } from "vitest";
import { openDatabase } from "@/infrastructure/database/connection";
import {
  categories,
  patternPieces,
  patternVersions,
} from "@/infrastructure/database/catalog-schema";
import { auditLog, user } from "@/infrastructure/database/schema";
import {
  createPattern,
  listCategories,
  listDefinitions,
  listPatterns,
  patternAction,
  patternFilters,
  readPattern,
  saveDraft,
  saveLibrary,
  type CatalogActor,
} from "@/modules/catalog/service";
import { emptyDraft } from "@/modules/catalog/validation";
import { testDatabaseUrl } from "../support/database";

const { db, close } = openDatabase(testDatabaseUrl());
const admin: CatalogActor = { id: randomUUID(), role: "ADMIN" };
const designer: CatalogActor = { id: randomUUID(), role: "DESIGNER" };
const other: CatalogActor = { id: randomUUID(), role: "DESIGNER" };
const customer: CatalogActor = { id: randomUUID(), role: "CUSTOMER" };
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(user).values(
    [admin, designer, other, customer].map((actor) => ({
      id: actor.id,
      email: actor.id + "@verse.example.test",
      name: actor.role,
      emailVerified: true,
    })),
  );
});
afterAll(() => close());

it("persists libraries and audits changes, rejects duplicate slugs and customer writes", async () => {
  const slug = randomUUID();
  const value = {
    name: "Linen garments",
    slug,
    description: "Synthetic",
    position: 20,
    archived: false,
  };
  const category = await saveLibrary(db, admin, "categories", { value });
  await expect(
    saveLibrary(db, admin, "categories", { value }),
  ).rejects.toMatchObject({ cause: { code: "23505" } });
  await expect(
    saveLibrary(db, customer, "categories", { value }),
  ).rejects.toMatchObject({ code: "forbidden" });
  await saveLibrary(db, admin, "categories", {
    id: category.id,
    value: { ...value, position: 3, archived: true },
  });
  expect(await listCategories(db, slug)).toEqual([
    expect.objectContaining({ id: category.id, position: 3, archived: true }),
  ]);

  const definition = {
    key: slug,
    name: "Torso",
    description: "",
    instructions: "",
    unit: "cm",
    min: 500_000,
    max: 1_400_000,
    precision: 1,
    archived: false,
  };
  const measurement = await saveLibrary(db, admin, "measurements", {
    value: definition,
  });
  await saveLibrary(db, admin, "measurements", {
    id: measurement.id,
    value: { ...definition, name: "Torso length", archived: true },
  });
  expect(await listDefinitions(db, slug)).toEqual([
    expect.objectContaining({ name: "Torso length", archived: true }),
  ]);
  expect(
    await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.resourceId, measurement.id)),
  ).toEqual(
    expect.arrayContaining([
      { action: "measurement.created" },
      { action: "measurement.archived" },
    ]),
  );
});

it("protects ownership and prevents stale or partial draft writes", async () => {
  await expect(createPattern(db, customer)).rejects.toMatchObject({
    code: "forbidden",
  });
  const { id } = await createPattern(db, designer);
  const { version } = await readPattern(db, designer, id);
  const update = {
    versionId: version.id,
    revision: 0,
    draft: { ...emptyDraft, name: "Coat" },
  };
  await expect(readPattern(db, customer, id)).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(saveDraft(db, other, id, update)).rejects.toMatchObject({
    code: "forbidden",
  });
  const results = await Promise.allSettled([
    saveDraft(db, designer, id, update),
    saveDraft(db, admin, id, update),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({
    reason: { code: "conflict" },
  });
  await expect(
    saveDraft(db, designer, id, {
      ...update,
      revision: 1,
      draft: {
        ...update.draft,
        name: "Not persisted",
        measurements: [
          { definitionId: randomUUID(), required: true, min: null, max: null },
        ],
      },
    }),
  ).rejects.toMatchObject({ code: "invalid" });
  expect(await readPattern(db, designer, id)).toMatchObject({
    version: { revision: 1 },
    draft: { name: "Coat" },
  });
  const events = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.resourceId, id));
  expect(
    events.filter(({ action }) => action === "pattern.draft.updated"),
  ).toHaveLength(1);
  expect(
    (
      await listPatterns(
        db,
        admin,
        patternFilters.parse({ q: "Coat", category: "", state: "DRAFT" }),
      )
    ).rows,
  ).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
});

it("rejects publication, retains historical snapshots and clones a published version without changing it", async () => {
  const key = randomUUID();
  const categoryValue = {
    name: "Historical category",
    slug: key,
    description: "",
    position: 2,
    archived: false,
  };
  const category = await saveLibrary(db, admin, "categories", {
    value: categoryValue,
  });
  const definition = {
    key,
    name: "Historical waist",
    description: "",
    instructions: "",
    unit: "cm",
    min: 500_000,
    max: 1_400_000,
    precision: 1,
    archived: false,
  };
  const measurement = await saveLibrary(db, admin, "measurements", {
    value: definition,
  });
  const { id } = await createPattern(db, admin);
  const { version } = await readPattern(db, admin, id);
  const pieceId = randomUUID();
  await saveDraft(db, admin, id, {
    versionId: version.id,
    revision: 0,
    draft: {
      ...emptyDraft,
      name: "Wrap garment",
      categoryId: category.id,
      slug: key,
      pieces: [
        {
          id: pieceId,
          name: "Front",
          description: "",
          quantity: 2,
          fabric: "",
          fold: false,
          mirrored: true,
          grainline: "",
          seam: 1500,
        },
      ],
      measurements: [
        { definitionId: measurement.id, required: true, min: null, max: null },
      ],
      variants: [
        {
          id: randomUUID(),
          label: "Custom",
          ranges: [
            { definitionId: measurement.id, min: 600_000, max: 700_000 },
          ],
        },
      ],
    },
  });
  await expect(patternAction(db, admin, id, "publish")).resolves.toMatchObject({
    rejected: true,
    checks: { documents: false },
  });
  expect((await readPattern(db, admin, id)).version.state).toBe("DRAFT");
  await expect(
    patternAction(db, designer, id, "publish"),
  ).rejects.toMatchObject({ code: "forbidden" });
  const events = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.resourceId, id));
  expect(events.map(({ action }) => action)).toEqual(
    expect.arrayContaining(["publication.attempted", "publication.rejected"]),
  );

  // Seed historical state using the test operator connection. The application does not expose this transition in Phase 3.
  await db
    .update(patternVersions)
    .set({ state: "PUBLISHED", publishedAt: new Date() })
    .where(eq(patternVersions.id, version.id));
  await expect(
    db
      .update(patternVersions)
      .set({ name: "Changed" })
      .where(eq(patternVersions.id, version.id)),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
  await expect(
    db.delete(patternPieces).where(eq(patternPieces.versionId, version.id)),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
  await expect(
    db.delete(categories).where(eq(categories.id, category.id)),
  ).rejects.toMatchObject({ cause: { code: "23503" } });

  await saveLibrary(db, admin, "categories", {
    id: category.id,
    value: { ...categoryValue, name: "Current category" },
  });
  await saveLibrary(db, admin, "measurements", {
    id: measurement.id,
    value: { ...definition, name: "Current waist" },
  });
  const clone = await patternAction(db, admin, id, "new-version");
  expect(clone).toHaveProperty("versionId");
  expect(await readPattern(db, admin, id, 1)).toMatchObject({
    version: { state: "PUBLISHED", categoryName: categoryValue.name },
    definitions: [expect.objectContaining({ name: definition.name })],
  });
  expect(await readPattern(db, admin, id)).toMatchObject({
    version: { number: 2, revision: 0, state: "DRAFT" },
    draft: { pieces: [expect.objectContaining({ id: pieceId })] },
  });
  await patternAction(db, admin, id, "archive");
  expect(await readPattern(db, admin, id)).toMatchObject({
    pattern: { archivedAt: expect.any(Date) },
  });
  expect(
    (
      await listPatterns(
        db,
        admin,
        patternFilters.parse({ state: "ARCHIVED", q: key }),
      )
    ).rows.map((row) => row.id),
  ).toContain(id);
});
