import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { openDatabase } from "../../src/infrastructure/database/connection";
import {
  categories,
  patterns,
  patternVersions,
} from "../../src/infrastructure/database/catalog-schema";
import { user } from "../../src/infrastructure/database/schema";
import {
  createPattern,
  readPattern,
  saveDraft,
  saveLibrary,
  type CatalogActor,
} from "../../src/modules/catalog/service";
import { emptyDraft } from "../../src/modules/catalog/validation";
import { testDatabaseUrl } from "./database";

export const fixtureDatabase = () => openDatabase(testDatabaseUrl());

export async function catalogFixture(
  db: ReturnType<typeof fixtureDatabase>["db"],
) {
  const key = randomUUID();
  const actor: CatalogActor = { id: randomUUID(), role: "ADMIN" };
  await db.insert(user).values({
    id: actor.id,
    email: actor.id + "@verse.example.test",
    name: "Synthetic owner",
    emailVerified: true,
  });
  const category = await saveLibrary(db, actor, "categories", {
    value: {
      name: "Atelier " + key,
      description: "",
      slug: key,
      archived: false,
      position: 10,
    },
  });
  const definition = await saveLibrary(db, actor, "measurements", {
    value: {
      key,
      name: "Măsurătoare " + key,
      description: "Sintetic",
      instructions: "Măsoară orizontal.",
      precision: 1,
      unit: "cm",
      min: 350000,
      max: 1300000,
      archived: false,
    },
  });
  async function add(
    suffix: string,
    state: "published" | "draft" | "archived" = "published",
  ) {
    const { id } = await createPattern(db, actor);
    const { version } = await readPattern(db, actor, id);
    const slug = key + "-" + suffix;
    await saveDraft(db, actor, id, {
      versionId: version.id,
      revision: 0,
      draft: {
        ...emptyDraft,
        name: "Tipar " + slug,
        slug,
        short: "Descriere sintetică " + key,
        description: "Detalii",
        materials: "In",
        instructions: "Coase.",
        categoryId: category.id,
        difficulty: "BEGINNER",
        pricing: { kind: "PREMIUM", amount: 2500, currency: "RON" },
        measurements: [
          { definitionId: definition.id, required: true, min: null, max: null },
        ],
        pieces: [
          {
            id: randomUUID(),
            name: "Piesă de test",
            description: "",
            quantity: 2,
            fabric: "In",
            fold: false,
            mirrored: false,
            grainline: "",
            seam: 10000,
          },
        ],
        variants: [
          {
            id: randomUUID(),
            label: "Atelier A",
            ranges: [{ definitionId: definition.id, min: 700000, max: 800000 }],
          },
          {
            id: randomUUID(),
            label: "Atelier B",
            ranges: [{ definitionId: definition.id, min: 800000, max: 950000 }],
          },
        ],
      },
    });
    // Test operator only. The application publication boundary stays closed.
    if (state !== "draft")
      await db
        .update(patternVersions)
        .set({ state: "PUBLISHED", publishedAt: new Date() })
        .where(eq(patternVersions.id, version.id));
    if (state === "archived")
      await db
        .update(patterns)
        .set({ archivedAt: new Date() })
        .where(eq(patterns.id, id));
    return { id, slug, versionId: version.id };
  }
  async function archiveCategory() {
    await db
      .update(categories)
      .set({ archived: true })
      .where(eq(categories.id, category.id));
  }
  return { key, actor, category, definition, add, archiveCategory };
}
