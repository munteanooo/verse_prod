import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  measurementDefinitions,
  patternVersions,
} from "@/infrastructure/database/catalog-schema";
import { measurementValues } from "@/infrastructure/database/profile-schema";
import { user } from "@/infrastructure/database/schema";
import {
  patternAction,
  readPattern,
  saveDraft,
} from "@/modules/catalog/service";
import {
  catalogFilters,
  discoverableSlugs,
  publicCategories,
  publishedPattern,
  publishedPatterns,
} from "@/modules/customer/public-catalog";
import {
  deleteProfile,
  listProfiles,
  readProfile,
  saveProfile,
} from "@/modules/customer/profiles";
import { catalogFixture, fixtureDatabase } from "../support/customer-fixtures";

const { db, close } = fixtureDatabase();
beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
afterAll(() => close());

it("filters, pages and projects only current published versions and safe category counts", async () => {
  const fixture = await catalogFixture(db);
  const first = await fixture.add("first");
  const draft = await fixture.add("draft", "draft");
  const archived = await fixture.add("archived", "archived");
  for (let i = 0; i < 12; i++) await fixture.add("page-" + i);
  await patternAction(db, fixture.actor, first.id, "new-version");
  const editing = await readPattern(db, fixture.actor, first.id);
  const latestSlug = fixture.key + "-latest";
  await saveDraft(db, fixture.actor, first.id, {
    versionId: editing.version.id,
    revision: 0,
    draft: { ...editing.draft, slug: latestSlug, name: "Tipar nou" },
  });
  expect((await publishedPattern(db, first.slug))?.name).toBe(
    "Tipar " + first.slug,
  );
  expect(await publishedPattern(db, latestSlug)).toBeUndefined();
  await db
    .update(patternVersions)
    .set({ state: "PUBLISHED", publishedAt: new Date() })
    .where(eq(patternVersions.id, editing.version.id));
  expect(await publishedPattern(db, first.slug)).toBeUndefined();
  expect(await publishedPattern(db, latestSlug)).toMatchObject({
    name: "Tipar nou",
    pieces: [{ name: "Piesă de test" }],
  });
  const dto = await publishedPattern(db, latestSlug);
  for (const key of [
    "ownerId",
    "versionId",
    "id",
    "revision",
    "state",
    "publishedAt",
  ])
    expect(dto).not.toHaveProperty(key);
  expect(await publishedPattern(db, draft.slug)).toBeUndefined();
  expect(await publishedPattern(db, archived.slug)).toBeUndefined();

  const filters = {
    category: fixture.key,
    sort: "name",
    difficulty: "BEGINNER",
    price: "PREMIUM",
  };
  const page1 = await publishedPatterns(db, catalogFilters.parse(filters));
  const page2 = await publishedPatterns(
    db,
    catalogFilters.parse({ ...filters, page: "2" }),
  );
  expect(page1.rows).toHaveLength(12);
  expect(page1.next).toBe(true);
  expect(page2.rows).toHaveLength(1);
  expect(page1.rows.map(({ slug }) => slug)).not.toContain(page2.rows[0].slug);
  expect(
    await publishedPatterns(
      db,
      catalogFilters.parse({ ...filters, q: "Tipar nou" }),
    ),
  ).toMatchObject({ rows: [{ slug: latestSlug }], next: false });
  expect(await publicCategories(db, fixture.key)).toEqual([
    expect.objectContaining({ count: 13 }),
  ]);
  await fixture.archiveCategory();
  expect(await publishedPattern(db, latestSlug)).toBeUndefined();
  expect(await publicCategories(db, fixture.key)).toEqual([]);
  expect((await discoverableSlugs(db)).map(({ slug }) => slug)).not.toContain(
    latestSlug,
  );
});

it("keeps profiles private, preserves snapshots and deletes measurements with the profile", async () => {
  const fixture = await catalogFixture(db);
  await fixture.add("profiles");
  const other = randomUUID();
  await db.insert(user).values({
    id: other,
    email: other + "@verse.example.test",
    name: "Other",
    emailVerified: true,
  });
  const owner = fixture.actor.id;
  const values = [
    { definitionId: fixture.definition.id, unit: "cm", text: "79,5" },
  ];
  const saved = await saveProfile(db, owner, {
    name: "Personal",
    userId: other,
    values,
  });
  expect(await listProfiles(db, other)).toEqual([]);
  expect(await readProfile(db, other, saved.id)).toBeUndefined();
  await expect(
    saveProfile(db, other, { name: "Bad", revision: 0, values }, saved.id),
  ).rejects.toMatchObject({ code: "missing" });
  await expect(deleteProfile(db, other, saved.id)).rejects.toMatchObject({
    code: "missing",
  });
  await db
    .update(measurementDefinitions)
    .set({ min: 800000, unit: "mm", archived: true })
    .where(eq(measurementDefinitions.id, fixture.definition.id));
  await saveProfile(
    db,
    owner,
    { name: "Editat", revision: 0, values },
    saved.id,
  );
  expect(await readProfile(db, owner, saved.id)).toMatchObject({
    name: "Editat",
    revision: 1,
    values: [{ length: 795000, field: { unit: "cm" } }],
  });
  await expect(
    saveProfile(db, owner, { name: "Conflict", revision: 0, values }, saved.id),
  ).rejects.toMatchObject({ code: "conflict" });
  await expect(
    saveProfile(db, owner, { name: "Invalid", values: [...values, ...values] }),
  ).rejects.toMatchObject({ code: "invalid" });
  await deleteProfile(db, owner, saved.id);
  expect(await readProfile(db, owner, saved.id)).toBeUndefined();
  expect(
    await db
      .select()
      .from(measurementValues)
      .where(eq(measurementValues.profileId, saved.id)),
  ).toEqual([]);
});
