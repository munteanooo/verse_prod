import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import sharp from "sharp";
import type { Database } from "../../infrastructure/database/connection";
import {
  fileAssets,
  documentJobs,
  patternWithdrawals,
} from "../../infrastructure/database/file-schema";
import {
  patternPieces,
  patternSizes,
  patterns,
  patternVersions,
} from "../../infrastructure/database/catalog-schema";
import { runPdf } from "../../infrastructure/documents/pdf-worker";
import type { DocumentLimits } from "../../config/storage-environment";
import type { ObjectStorage } from "../../infrastructure/documents/storage";
import { recordAudit } from "../identity/audit";
import { readPattern, type CatalogActor } from "../catalog/service";
import { publicationDecision } from "../catalog/lifecycle";
import {
  associationInput,
  isImage,
  isSource,
  lifecycleInput,
  processInput,
  safeFilename,
  scaleInput,
  uploadInput,
} from "./types";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type File = typeof fileAssets.$inferSelect;
type Context = {
  db: Database;
  actor: CatalogActor;
  storage: ObjectStorage;
  limits: DocumentLimits;
};
export type DocumentActor = CatalogActor & { sessionId: string };
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const quarantine = (id: string) => "q/" + id;
const object = () => "o/" + randomUUID();
const active = or(
  eq(fileAssets.status, "VALIDATED"),
  eq(fileAssets.status, "READY"),
);
const rejectedReasons = new Set([
  "active",
  "complexity",
  "format",
  "geometry",
  "not-a4",
  "output",
  "pages",
  "size",
  "checksum",
  "timeout",
  "busy",
  "missing",
  "conflict",
  "processing",
  "storage",
]);

export class FileError extends Error {
  constructor(
    public code: string,
    public status = 422,
  ) {
    super(code);
  }
}
const fail = (code: string, status?: number): never => {
  throw new FileError(code, status);
};
const safeReason = (error: unknown) =>
  error instanceof Error && rejectedReasons.has(error.message)
    ? error.message
    : "processing";

export function verifyUpload(
  bytes: Uint8Array,
  expected: { bytes: number; checksum: string },
) {
  if (bytes.byteLength !== expected.bytes) fail("size");
  if (hash(bytes) !== expected.checksum) fail("checksum");
}
export function completeSources(
  files: { pieceId: string | null; confirmedAt: Date | null }[],
  pieces: string[],
) {
  return (
    files.every((file) => file.confirmedAt) &&
    ((files.length === 1 && files[0].pieceId === null) ||
      (pieces.length > 0 &&
        files.length === pieces.length &&
        pieces.every(
          (id) => files.filter((file) => file.pieceId === id).length === 1,
        )))
  );
}

function admin(actor: CatalogActor) {
  if (actor.role !== "ADMIN") fail("missing", 404);
}

async function lockDraft(tx: Tx, versionId: string, allowArchived = false) {
  const [entry] = await tx
    .select({ patternId: patternVersions.patternId })
    .from(patternVersions)
    .where(eq(patternVersions.id, versionId));
  if (!entry) throw new FileError("missing", 404);
  const [pattern] = await tx
    .select()
    .from(patterns)
    .where(eq(patterns.id, entry.patternId))
    .for("update");
  const [version] = await tx
    .select()
    .from(patternVersions)
    .where(eq(patternVersions.id, versionId))
    .for("update");
  if (
    !pattern ||
    (pattern.archivedAt && !allowArchived) ||
    version?.state !== "DRAFT"
  )
    throw new FileError("conflict", 409);
  return { pattern, version };
}

async function findFile(db: Pick<Database, "select">, id: string) {
  const [file] = await db
    .select()
    .from(fileAssets)
    .where(eq(fileAssets.id, id));
  if (!file) throw new FileError("missing", 404);
  return file;
}

async function log(
  tx: Tx,
  actor: CatalogActor,
  id: string,
  action: string,
  metadata?: Record<string, string | number | boolean>,
) {
  await recordAudit(tx, {
    actorId: actor.id,
    action,
    resourceType: "file",
    resourceId: id,
    metadata,
  });
}

export function fileSummary(file: File) {
  const {
    id,
    sizeId,
    pieceId,
    definitionId,
    filename,
    bytes,
    purpose,
    status,
    alt,
    position,
    mode,
    geometry,
    overview,
    pages,
    reason,
    confirmedAt,
    scaleReference,
    revision,
  } = file;
  return {
    id,
    sizeId,
    pieceId,
    definitionId,
    filename,
    bytes,
    purpose,
    status,
    alt,
    position,
    mode,
    geometry,
    overview,
    pages,
    reason,
    confirmedAt,
    scaleReference,
    revision,
  };
}
export type FileSummary = ReturnType<typeof fileSummary>;

export async function listFiles(
  db: Database,
  actor: CatalogActor,
  versionId: string,
) {
  admin(actor);
  const rows = await db
    .select()
    .from(fileAssets)
    .where(
      and(
        eq(fileAssets.versionId, versionId),
        or(
          eq(fileAssets.status, "PENDING"),
          eq(fileAssets.status, "REJECTED"),
          active,
        ),
      ),
    )
    .orderBy(
      asc(fileAssets.position),
      asc(fileAssets.createdAt),
      asc(fileAssets.id),
    )
    .limit(200);
  return rows.map(fileSummary);
}

export async function beginUpload(
  { db, actor, storage, limits }: Context,
  raw: unknown,
) {
  admin(actor);
  const input = uploadInput.parse(raw);
  const source = isSource(input.purpose);
  if (input.bytes > (source ? limits.pdfBytes : limits.imageBytes))
    fail("size");
  if (
    source
      ? !input.sizeId || !input.mode || input.definitionId
      : !input.alt ||
        input.sizeId ||
        input.mode ||
        (input.purpose === "PATTERN_PREVIEW") !== Boolean(input.pieceId) ||
        (input.purpose === "MEASUREMENT_ILLUSTRATION") !==
          Boolean(input.definitionId)
  )
    fail("invalid", 400);
  const fileId = randomUUID();
  const expires = new Date(Date.now() + limits.uploadTtl * 1000);
  const upload = await storage.authorizeUpload(
    quarantine(fileId),
    input.bytes,
    expires,
  );
  await db.transaction(async (tx) => {
    await lockDraft(tx, input.versionId);
    const [total] = await tx
      .select({ value: count() })
      .from(fileAssets)
      .where(
        and(
          eq(fileAssets.versionId, input.versionId),
          inArray(fileAssets.status, ["PENDING", "VALIDATED", "READY"]),
        ),
      );
    if (total.value >= 180) fail("size");
    const [last] = await tx
      .select({ position: fileAssets.position })
      .from(fileAssets)
      .where(eq(fileAssets.versionId, input.versionId))
      .orderBy(desc(fileAssets.position))
      .limit(1);
    await tx.insert(fileAssets).values({
      ...input,
      id: fileId,
      filename: safeFilename(input.filename),
      provider: storage.provider,
      creatorId: actor.id,
      expiresAt: expires,
      position: Math.min((last?.position ?? -1) + 1, 1000),
    });
    await log(tx, actor, fileId, "upload.authorized", {
      purpose: input.purpose,
      bytes: input.bytes,
    });
  });
  return { id: fileId, ...upload };
}

export async function localUploadFile(
  db: Database,
  actor: CatalogActor,
  id: string,
) {
  admin(actor);
  const file = await findFile(db, id);
  if (
    file.status !== "PENDING" ||
    file.creatorId !== actor.id ||
    file.provider !== "local" ||
    !file.expiresAt ||
    file.expiresAt.getTime() <= Date.now()
  )
    fail("missing", 404);
  return file;
}

async function decodeImage(bytes: Uint8Array) {
  const decoder = sharp(bytes, {
    animated: false,
    limitInputPixels: 24_000_000,
    failOn: "warning",
  }).timeout({ seconds: 3 });
  const info = await decoder.metadata();
  if (
    !info.format ||
    !["jpeg", "png", "webp"].includes(info.format) ||
    (info.pages ?? 1) !== 1 ||
    !info.width ||
    !info.height ||
    info.width > 6500 ||
    info.height > 6500
  )
    fail("format");
  const output = await decoder
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
  if (output.byteLength > 2_000_000) fail("size");
  return output;
}

async function removeFiles(tx: Tx, ids: string[]) {
  if (!ids.length) return;
  await tx
    .update(fileAssets)
    .set({ status: "REMOVED", sizeId: null, pieceId: null, definitionId: null })
    .where(inArray(fileAssets.id, ids));
}

const retireOutput = async (tx: Tx, versionId: string, sizeId: string) => {
  const rows = await tx
    .select({ id: fileAssets.id })
    .from(fileAssets)
    .where(
      and(
        eq(fileAssets.versionId, versionId),
        eq(fileAssets.sizeId, sizeId),
        eq(fileAssets.purpose, "PATTERN_A4_PDF"),
        eq(fileAssets.status, "READY"),
      ),
    );
  await removeFiles(
    tx,
    rows.map(({ id }) => id),
  );
};

export async function completeUpload(
  { db, actor, storage, limits }: Context,
  id: string,
) {
  admin(actor);
  const file = await findFile(db, id);
  if (file.creatorId !== actor.id || file.provider !== storage.provider)
    fail("missing", 404);
  if (["READY", "VALIDATED", "REJECTED"].includes(file.status))
    return fileSummary(file);
  if (
    file.status !== "PENDING" ||
    !file.expiresAt ||
    file.expiresAt.getTime() <= Date.now()
  )
    fail("conflict", 409);
  const source = isSource(file.purpose);
  const max = source ? limits.pdfBytes : limits.imageBytes;
  let head;
  try {
    head = await storage.head(quarantine(id));
  } catch {
    throw new FileError("missing", 409);
  }
  let trusted: Uint8Array | undefined;
  let pages: number | undefined;
  let geometry: File["geometry"];
  let reason: string | undefined;
  let uploaded = false;
  try {
    if (head.size !== file.bytes || head.size > max) fail("size");
    const bytes = await storage.get(quarantine(id), max);
    verifyUpload(bytes, file);
    uploaded = true;
    if (source) {
      const inspected = await runPdf(
        { operation: "inspect", bytes, mode: file.mode! },
        limits,
      );
      pages = inspected.pages;
      geometry = inspected.geometry;
      trusted = bytes;
    } else trusted = await decodeImage(bytes);
  } catch (error) {
    reason = safeReason(error);
    if (reason === "busy") throw new FileError("busy", 409);
  }

  const key = trusted ? object() : undefined;
  if (key && trusted)
    await storage.put(key, trusted, source ? "application/pdf" : "image/webp");
  let keeper = false;
  try {
    const saved = await db.transaction(async (tx) => {
      await lockDraft(tx, file.versionId);
      const current = await findFile(tx, id);
      if (current.status !== "PENDING") return current;
      if (uploaded) await log(tx, actor, id, "upload.completed");
      if (trusted && file.purpose === "COVER_IMAGE") {
        const previous = await tx
          .select({ id: fileAssets.id })
          .from(fileAssets)
          .where(
            and(
              eq(fileAssets.versionId, file.versionId),
              eq(fileAssets.purpose, "COVER_IMAGE"),
              eq(fileAssets.status, "READY"),
            ),
          );
        await removeFiles(
          tx,
          previous.map(({ id }) => id),
        );
      }
      if (trusted && file.sizeId)
        await retireOutput(tx, file.versionId, file.sizeId);
      const [next] = await tx
        .update(fileAssets)
        .set({
          objectKey: key,
          status: trusted ? (source ? "VALIDATED" : "READY") : "REJECTED",
          mediaType: trusted
            ? source
              ? "application/pdf"
              : "image/webp"
            : undefined,
          pages,
          geometry,
          reason,
          bytes: trusted?.byteLength,
          checksum: trusted ? hash(trusted) : undefined,
        })
        .where(eq(fileAssets.id, id))
        .returning();
      await log(
        tx,
        actor,
        id,
        trusted ? "asset.validated" : "asset.rejected",
        reason ? { reason } : undefined,
      );
      if (trusted)
        await log(tx, actor, id, "asset.association.changed", {
          purpose: file.purpose,
        });
      return next;
    });
    keeper = Boolean(key && saved.objectKey === key);
    if (storage.provider === "local")
      await storage
        .delete(quarantine(id))
        .catch(() => console.error("Local quarantine cleanup failed."));
    return fileSummary(saved);
  } finally {
    if (key && !keeper)
      await storage
        .delete(key)
        .catch(() => console.error("Unused validated object needs cleanup."));
  }
}

export async function changeFile(
  { db, actor }: Context,
  id: string,
  action: "scale" | "remove" | "association",
  body?: unknown,
) {
  admin(actor);
  return db.transaction(async (tx) => {
    const file = await findFile(tx, id);
    await lockDraft(tx, file.versionId);
    const current = await findFile(tx, id);
    if (current.status === "REMOVED") fail("missing", 404);
    if (action === "scale") {
      if (!isSource(current.purpose) || current.status !== "VALIDATED")
        fail("conflict", 409);
      const { reference } = scaleInput.parse(body);
      await tx
        .update(fileAssets)
        .set({ confirmedAt: new Date(), scaleReference: reference })
        .where(eq(fileAssets.id, id));
    } else if (action === "association") {
      if (!isImage(current.purpose) || current.status !== "READY")
        fail("conflict", 409);
      const entry = associationInput.parse(body);
      await tx.update(fileAssets).set(entry).where(eq(fileAssets.id, id));
    } else {
      await removeFiles(tx, [id]);
      if (isSource(current.purpose) && current.sizeId)
        await retireOutput(tx, current.versionId, current.sizeId);
    }
    await log(tx, actor, id, "asset.association.changed", { action });
    return { ok: true };
  });
}

async function inputSources(tx: Tx, versionId: string, sizeId: string) {
  const files = await tx
    .select()
    .from(fileAssets)
    .where(
      and(
        eq(fileAssets.versionId, versionId),
        eq(fileAssets.sizeId, sizeId),
        eq(fileAssets.purpose, "PATTERN_SOURCE_PDF"),
        eq(fileAssets.status, "VALIDATED"),
      ),
    );
  const pieces = await tx
    .select({ id: patternPieces.id })
    .from(patternPieces)
    .where(eq(patternPieces.versionId, versionId))
    .orderBy(asc(patternPieces.position));
  const pieceIds = pieces.map(({ id }) => id);
  if (!completeSources(files, pieceIds)) fail("incomplete");
  return files.sort(
    (a, b) =>
      pieceIds.indexOf(a.pieceId ?? "") - pieceIds.indexOf(b.pieceId ?? ""),
  );
}

export async function processDocuments(
  { db, actor, storage, limits }: Context,
  raw: unknown,
) {
  admin(actor);
  const input = processInput.parse(raw);
  const { versionId, sizeId, ...options } = input;
  const prepared = await db.transaction(async (tx) => {
    const { version } = await lockDraft(tx, versionId);
    await tx.execute(sql`select pg_advisory_xact_lock(500510)`);
    const running = await tx
      .select()
      .from(documentJobs)
      .where(
        and(
          eq(documentJobs.status, "PROCESSING"),
          gt(documentJobs.expiresAt, new Date()),
        ),
      );
    if (
      running.length >= limits.concurrent ||
      running.some(
        (job) => job.versionId === versionId && job.sizeId === sizeId,
      )
    )
      fail("busy", 409);
    const [size] = await tx
      .select()
      .from(patternSizes)
      .where(
        and(eq(patternSizes.versionId, versionId), eq(patternSizes.id, sizeId)),
      );
    if (!size?.label || !version.name) fail("incomplete");
    const sources = await inputSources(tx, versionId, sizeId);
    if (
      sources.length > limits.sourcePages ||
      sources.reduce((sum, item) => sum + item.bytes, 0) > limits.pdfBytes
    )
      fail("size");
    const [job] = await tx
      .insert(documentJobs)
      .values({ versionId, sizeId, expiresAt: new Date(Date.now() + 40_000) })
      .returning();
    await log(tx, actor, job.id, "document.processing.started");
    return {
      sources,
      job,
      revision: version.revision,
      labels: { name: version.name, size: size.label, version: version.number },
    };
  });

  let key: string | undefined;
  let keeper = false;
  try {
    const sources = [];
    const fetchDeadline = Date.now() + 20_000;
    for (const file of prepared.sources) {
      if (Date.now() >= fetchDeadline) fail("timeout");
      if (!file.objectKey || file.provider !== storage.provider)
        throw new FileError("storage");
      const bytes = await storage.get(file.objectKey, limits.pdfBytes);
      verifyUpload(bytes, file);
      sources.push({ mode: file.mode!, bytes });
    }
    const rendered = await runPdf(
      { operation: "render", sources, options, labels: prepared.labels },
      limits,
    );
    if (!rendered.bytes) throw new FileError("processing");
    key = object();
    const bytes = rendered.bytes;
    await storage.put(key, bytes, "application/pdf");
    const saved = await db.transaction(async (tx) => {
      const { version } = await lockDraft(tx, versionId);
      if (
        version.revision !== prepared.revision ||
        prepared.job.expiresAt.getTime() <= Date.now()
      )
        fail("conflict", 409);
      const current = await inputSources(tx, versionId, sizeId);
      if (
        current.map(({ id }) => id).join() !==
        prepared.sources.map(({ id }) => id).join()
      )
        fail("conflict", 409);
      await retireOutput(tx, versionId, sizeId);
      const [file] = await tx
        .insert(fileAssets)
        .values({
          versionId,
          sizeId,
          creatorId: actor.id,
          provider: storage.provider,
          objectKey: key,
          filename: safeFilename(
            prepared.labels.name + "-" + prepared.labels.size + ".pdf",
          ),
          bytes: bytes.byteLength,
          checksum: hash(bytes),
          mediaType: "application/pdf",
          purpose: "PATTERN_A4_PDF",
          status: "READY",
          pages: rendered.pages,
          overview: rendered.overview,
          geometry: rendered.geometry,
          revision: version.revision,
        })
        .returning();
      await tx
        .update(documentJobs)
        .set({ status: "READY" })
        .where(eq(documentJobs.id, prepared.job.id));
      await log(tx, actor, file.id, "document.processing.completed", {
        pages: rendered.pages,
      });
      return file;
    });
    keeper = true;
    return fileSummary(saved);
  } catch (error) {
    const reason = safeReason(error);
    await db.transaction(async (tx) => {
      await tx
        .update(documentJobs)
        .set({ status: "FAILED", reason })
        .where(eq(documentJobs.id, prepared.job.id));
      await log(tx, actor, prepared.job.id, "document.processing.failed", {
        reason,
      });
    });
    throw new FileError(
      reason,
      reason === "busy" || reason === "conflict" ? 409 : 422,
    );
  } finally {
    if (key && !keeper)
      await storage
        .delete(key)
        .catch(() => console.error("Unused generated object needs cleanup."));
  }
}

export async function cleanupFiles({ db, actor, storage }: Context) {
  admin(actor);
  const now = new Date();
  const rows = await db
    .select()
    .from(fileAssets)
    .where(
      and(
        eq(fileAssets.provider, storage.provider),
        isNull(fileAssets.cleanedAt),
        or(
          and(lt(fileAssets.expiresAt, now), eq(fileAssets.status, "PENDING")),
          and(
            or(
              eq(fileAssets.status, "REJECTED"),
              eq(fileAssets.status, "REMOVED"),
            ),
            or(isNull(fileAssets.expiresAt), lt(fileAssets.expiresAt, now)),
          ),
        ),
      ),
    )
    .orderBy(asc(fileAssets.createdAt))
    .limit(20);
  let cleaned = 0;
  for (const row of rows) {
    if (row.status === "PENDING") {
      await db.transaction(async (tx) => {
        await lockDraft(tx, row.versionId, true);
        await tx
          .update(fileAssets)
          .set({ status: "REJECTED", reason: "expired" })
          .where(
            and(eq(fileAssets.id, row.id), eq(fileAssets.status, "PENDING")),
          );
        await log(tx, actor, row.id, "asset.rejected", { reason: "expired" });
      });
    }
    const current = await findFile(db, row.id);
    if (current.status !== "REJECTED" && current.status !== "REMOVED") continue;
    if (row.expiresAt) await storage.delete(quarantine(row.id));
    if (current.objectKey) await storage.delete(current.objectKey);
    await db
      .update(fileAssets)
      .set({ cleanedAt: new Date() })
      .where(eq(fileAssets.id, row.id));
    cleaned++;
  }
  return { cleaned };
}

export async function adminFile(db: Database, actor: CatalogActor, id: string) {
  admin(actor);
  return findFile(db, id);
}

export async function publishPattern(
  db: Database,
  storage: ObjectStorage,
  actor: DocumentActor,
  patternId: string,
  body: unknown,
) {
  admin(actor);
  const { revision, versionId } = lifecycleInput.parse(body);
  const details = await readPattern(db, actor, patternId);
  const assets = await db
    .select()
    .from(fileAssets)
    .where(and(eq(fileAssets.versionId, versionId), active));
  const cover = assets.find(
    (file) => file.purpose === "COVER_IMAGE" && file.status === "READY",
  );
  const output = details.draft.variants.map((variant) =>
    assets.find(
      (file) =>
        file.sizeId === variant.id &&
        file.purpose === "PATTERN_A4_PDF" &&
        file.status === "READY" &&
        file.revision === revision,
    ),
  );
  const required = [cover, ...output];
  let hasReady =
    output.length > 0 &&
    required.every(
      (file) => file?.objectKey && file.provider === storage.provider,
    );
  if (hasReady) {
    const checks = required.filter((file): file is File => Boolean(file));
    for (let i = 0; i < checks.length; i += 8) {
      const present = await Promise.all(
        checks.slice(i, i + 8).map(async (file) => {
          try {
            return (await storage.head(file.objectKey!)).size === file.bytes;
          } catch {
            return false;
          }
        }),
      );
      if (present.some((value) => !value)) {
        hasReady = false;
        break;
      }
    }
  }
  return db.transaction(async (tx) => {
    const meta = { number: details.version.number };
    const audit = (
      action: string,
      metadata: Record<string, string | number | boolean>,
    ) =>
      recordAudit(tx, {
        actorId: actor.id,
        action,
        resourceType: "pattern",
        resourceId: patternId,
        metadata,
      });
    await audit("publication.attempted", meta);
    const decision = publicationDecision(
      details.draft,
      details.version.state,
      Boolean(details.category && !details.category.archived),
      hasReady,
    );
    if (
      details.version.id !== versionId ||
      details.version.revision !== revision ||
      !decision.allowed
    ) {
      await audit("publication.rejected", { ...meta, reason: "readiness" });
      return { rejected: true as const, checks: decision.checks };
    }
    const result = await tx.execute<{ ok: boolean }>(
      sql`select public.publish_pattern_version(${patternId}::uuid,${versionId}::uuid,${revision},${actor.id},${actor.sessionId}) as ok`,
    );
    if (!result[0]?.ok) {
      await audit("publication.rejected", {
        ...meta,
        reason: "assets-or-conflict",
      });
      return {
        rejected: true as const,
        checks: { ...decision.checks, documents: false },
      };
    }
    await audit("pattern.published", meta);
    return { published: true as const };
  });
}

export async function withdrawPattern(
  db: Database,
  actor: DocumentActor,
  patternId: string,
) {
  admin(actor);
  return db.transaction(async (tx) => {
    const result = await tx.execute<{ ok: boolean }>(
      sql`select public.withdraw_pattern(${patternId}::uuid,${actor.id},${actor.sessionId}) as ok`,
    );
    if (!result[0]?.ok) fail("conflict", 409);
    await recordAudit(tx, {
      actorId: actor.id,
      action: "pattern.unpublished",
      resourceType: "pattern",
      resourceId: patternId,
    });
    return { unpublished: true };
  });
}

export async function publicationHidden(db: Database, patternId: string) {
  return Boolean(
    (
      await db
        .select()
        .from(patternWithdrawals)
        .where(eq(patternWithdrawals.patternId, patternId))
    )[0],
  );
}

export async function downloadAsset(
  file: File,
  storage: ObjectStorage,
  limits: DocumentLimits,
) {
  if (
    !file.objectKey ||
    file.status !== "READY" ||
    file.provider !== storage.provider ||
    file.purpose !== "PATTERN_A4_PDF"
  )
    fail("missing", 404);
  return storage.delivery(
    file.objectKey!,
    limits.outputBytes,
    'attachment; filename="' + safeFilename(file.filename) + '"',
  );
}
