import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readStorageEnvironment } from "@/config/storage-environment";
import { localStorage } from "@/infrastructure/documents/storage";
import { fileAssets } from "@/infrastructure/database/file-schema";
import {
  auditLog,
  privilegedSession,
  session,
  user,
  userRole,
} from "@/infrastructure/database/schema";
import { readPattern, saveDraft } from "@/modules/catalog/service";
import { publicEdition } from "@/modules/customer/public-catalog";
import {
  beginUpload,
  changeFile,
  cleanupFiles,
  completeUpload,
  downloadAsset,
  processDocuments,
  publishPattern,
  withdrawPattern,
  type DocumentActor,
} from "@/modules/documents/service";
import { freeDownload } from "@/modules/documents/types";
import { demoImage, demoPdf } from "../../scripts/documents/fixtures.mjs";
import { catalogFixture, fixtureDatabase } from "../support/customer-fixtures";

const { db, close } = fixtureDatabase();
const root = await mkdtemp(join(tmpdir(), "verse-document-integration-"));
const origin = "http://127.0.0.1:3103";
const config = readStorageEnvironment(origin, {
  STORAGE_PROVIDER: "local",
  STORAGE_LOCAL_ROOT: root,
})!;
const storage = localStorage(root, origin, "fixture-key");
const limits = config.limits;
beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
afterAll(async () => {
  await close();
  await rm(root, { recursive: true, force: true });
});

async function actorFor(id: string): Promise<DocumentActor> {
  await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, id));
  await db
    .update(userRole)
    .set({ role: "ADMIN" })
    .where(eq(userRole.userId, id));
  const sessionId = randomUUID();
  await db.insert(session).values({
    id: sessionId,
    token: randomUUID(),
    userId: id,
    expiresAt: new Date(Date.now() + 120000),
  });
  await db.insert(privilegedSession).values({ sessionId });
  return { id, role: "ADMIN", sessionId };
}

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function upload(
  actor: DocumentActor,
  bytes: Uint8Array,
  input: Record<string, unknown>,
) {
  const ctx = { db, actor, storage, limits };
  const request = await beginUpload(ctx, {
    ...input,
    bytes: bytes.length,
    checksum: sha(bytes),
  });
  await storage.put("q/" + request.id, bytes, "application/octet-stream");
  const validated = await completeUpload(ctx, request.id);
  expect(await completeUpload(ctx, request.id)).toEqual(validated);
  return validated;
}

it("validates assets, atomically publishes once, preserves history and withdraws public access", async () => {
  const fixture = await catalogFixture(db);
  const draft = await fixture.add("document-draft", "draft");
  const actor = await actorFor(fixture.actor.id);
  const ctx = { db, actor, storage, limits };
  const initial = await readPattern(db, actor, draft.id);
  await saveDraft(db, actor, draft.id, {
    versionId: draft.versionId,
    revision: initial.version.revision,
    draft: {
      ...initial.draft,
      variants: initial.draft.variants.map((size, index) =>
        index === 1
          ? {
              ...size,
              ranges: size.ranges.map((range) => ({ ...range, min: 810000 })),
            }
          : size,
      ),
    },
  });
  const saved = await readPattern(db, actor, draft.id);
  const payload = {
    versionId: draft.versionId,
    revision: saved.version.revision,
  };
  expect(
    await publishPattern(db, storage, actor, draft.id, payload),
  ).toHaveProperty("rejected", true);
  const cover = await upload(actor, await demoImage(), {
    versionId: draft.versionId,
    filename: "atelier.png",
    purpose: "COVER_IMAGE",
    alt: "Synthetic cover",
  });
  expect(cover.status).toBe("READY");

  const pdf = await demoPdf();
  const other = await fixture.add("other", "draft");
  const unrelated = await readPattern(db, actor, other.id);
  await expect(
    beginUpload(ctx, {
      versionId: draft.versionId,
      purpose: "PATTERN_SOURCE_PDF",
      filename: "fixture.pdf",
      mode: "FULL",
      sizeId: unrelated.draft.variants[0].id,
      bytes: pdf.length,
      checksum: sha(pdf),
    }),
  ).rejects.toMatchObject({ code: "23503" });

  for (const size of saved.draft.variants) {
    const source = await upload(actor, pdf, {
      versionId: draft.versionId,
      filename: "control.pdf",
      purpose: "PATTERN_SOURCE_PDF",
      sizeId: size.id,
      mode: "FULL",
    });
    expect(source.status).toBe("VALIDATED");
    await expect(
      processDocuments(ctx, { versionId: draft.versionId, sizeId: size.id }),
    ).rejects.toMatchObject({ code: "incomplete" });
    await changeFile(ctx, source.id, "scale", {
      reference: "100 mm ruler checked",
    });
    const output = await processDocuments(ctx, {
      versionId: draft.versionId,
      sizeId: size.id,
    });
    expect(output).toMatchObject({
      purpose: "PATTERN_A4_PDF",
      status: "READY",
      pages: 5,
    });
  }
  const results = await Promise.all([
    publishPattern(db, storage, actor, draft.id, payload),
    publishPattern(db, storage, actor, draft.id, payload),
  ]);
  expect(results.filter((value) => "published" in value)).toHaveLength(1);
  const edition = await publicEdition(db, draft.slug);
  expect(edition).toMatchObject({ edition: 1, price: "PREMIUM" });
  expect(freeDownload(edition.price, edition.state, true)).toBe(false);
  const assetList = await db
    .select()
    .from(fileAssets)
    .where(eq(fileAssets.versionId, draft.versionId));
  const output = assetList.find((value) => value.purpose === "PATTERN_A4_PDF")!;
  expect(
    (await downloadAsset(output, storage, limits)).bytes?.length,
  ).toBeGreaterThan(100);
  await expect(changeFile(ctx, cover.id, "remove")).rejects.toMatchObject({
    code: "conflict",
  });
  await expect(
    db.delete(fileAssets).where(eq(fileAssets.id, output.id)),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
  await expect(
    changeFile(
      { ...ctx, actor: { id: actor.id, role: "CUSTOMER" } },
      output.id,
      "remove",
    ),
  ).rejects.toMatchObject({ status: 404 });
  await withdrawPattern(db, actor, draft.id);
  expect(await publicEdition(db, draft.slug)).toBeUndefined();
  const events = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.resourceId, draft.id));
  expect(events.map((event) => event.action)).toEqual(
    expect.arrayContaining([
      "publication.rejected",
      "pattern.published",
      "pattern.unpublished",
    ]),
  );
});

it("rejects changed content and cleans expired quarantine objects", async () => {
  const fixture = await catalogFixture(db);
  const draft = await fixture.add("cleanup", "draft");
  const actor = await actorFor(fixture.actor.id);
  const ctx = { db, actor, storage, limits };
  const input = {
    versionId: draft.versionId,
    purpose: "COVER_IMAGE",
    filename: "fixture.png",
    alt: "Synthetic cover",
    bytes: 3,
    checksum: sha(Buffer.from("abc")),
  };
  const changed = await beginUpload(ctx, input);
  await storage.put(
    "q/" + changed.id,
    Buffer.from("def"),
    "application/octet-stream",
  );
  expect(await completeUpload(ctx, changed.id)).toMatchObject({
    status: "REJECTED",
    reason: "checksum",
  });
  const abandoned = await beginUpload(ctx, input);
  await storage.put(
    "q/" + abandoned.id,
    Buffer.from("abc"),
    "application/octet-stream",
  );
  await db
    .update(fileAssets)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(fileAssets.id, abandoned.id));
  expect((await cleanupFiles(ctx)).cleaned).toBeGreaterThan(0);
  await expect(storage.head("q/" + abandoned.id)).rejects.toThrow();
});
