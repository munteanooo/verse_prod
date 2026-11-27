import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { authorize } from "../auth/access";
import { getIdentity } from "../auth/service";
import {
  consumeAuthLimit,
  rateKey,
  requestRateIdentifier,
} from "../auth/throttle";
import { fileAssets, savedPatterns } from "../database/file-schema";
import { patternVersions } from "../database/catalog-schema";
import { CatalogError } from "../../modules/catalog/service";
import { id, slug } from "../../modules/catalog/validation";
import {
  libraryPatterns,
  publicEdition,
} from "../../modules/customer/public-catalog";
import { recordAudit } from "../../modules/identity/audit";
import { readJson } from "../../shared/http-json";
import {
  adminFile,
  beginUpload,
  changeFile,
  cleanupFiles,
  completeUpload,
  downloadAsset,
  FileError,
  fileSummary,
  listFiles,
  localUploadFile,
  processDocuments,
  publishPattern,
  publicationHidden,
  withdrawPattern,
  type DocumentActor,
} from "../../modules/documents/service";
import {
  freeDownload,
  isImage,
  safeFilename,
} from "../../modules/documents/types";
import {
  boundedBytes,
  fileStorage,
  validUploadToken,
  type ObjectStorage,
} from "./storage";
import type { Database } from "../database/connection";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
export const fileReply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers });

const key = (value: unknown) => id.parse(value);
async function* requestBytes(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function bytesReply(
  bytes: Uint8Array,
  mediaType: string,
  disposition?: string,
) {
  return new Response(Uint8Array.from(bytes).buffer, {
    headers: {
      ...headers,
      "Content-Type": mediaType,
      "Content-Length": String(bytes.byteLength),
      "Content-Security-Policy": "default-src 'none'; sandbox",
      ...(disposition && { "Content-Disposition": disposition }),
    },
  });
}
function documentReply(
  result: Awaited<ReturnType<typeof downloadAsset>>,
  filename: string,
) {
  if (result.bytes)
    return bytesReply(
      result.bytes,
      "application/pdf",
      'attachment; filename="' + safeFilename(filename) + '"',
    );
  return new Response(null, {
    status: 303,
    headers: { ...headers, Location: result.url },
  });
}

export function handleFileError(error: unknown) {
  if (error instanceof CatalogError)
    return fileReply(
      { code: error.code },
      error.code === "missing" ? 404 : 409,
    );
  if (error instanceof z.ZodError) return fileReply({ code: "invalid" }, 400);
  if (error instanceof FileError)
    return fileReply({ code: error.code }, error.status);
  const postgres = error as { code?: string; cause?: { code?: string } };
  const code = postgres.code ?? postgres.cause?.code;
  if (code === "23503") return fileReply({ code: "association" }, 409);
  console.error("File operation could not be completed.");
  return fileReply({ code: "unavailable" }, 503);
}

export async function adminDocuments(
  request: Request,
  path: string[],
  db: Database,
  actor: DocumentActor,
  origin: string,
  secret: string,
) {
  try {
    const env = fileStorage(origin, secret);
    const [resource, item, action, subaction, ...extra] = path;
    if (extra.length) return fileReply({ code: "missing" }, 404);
    if (
      resource === "patterns" &&
      item &&
      action === "publication" &&
      !subaction &&
      request.method === "GET"
    )
      return fileReply({ hidden: await publicationHidden(db, key(item)) });
    if (!env) return fileReply({ code: "storage" }, 503);
    const {
      storage,
      config: { limits },
    } = env;
    const context = { db, actor, storage, limits };
    const body = () => readJson(request, 8192);
    const write = request.method !== "GET";
    if (
      write &&
      !(await consumeAuthLimit(
        db,
        rateKey(secret, "file-" + resource, actor.id),
        100,
        60000,
      ))
    )
      return fileReply({ code: "busy" }, 429);
    if (
      resource === "patterns" &&
      item &&
      !subaction &&
      request.method === "POST"
    ) {
      if (action === "publish") {
        const result = await publishPattern(
          db,
          storage,
          actor,
          key(item),
          await body(),
        );
        return fileReply(result, "rejected" in result ? 422 : 200);
      }
      if (action === "unpublish")
        return fileReply(await withdrawPattern(db, actor, key(item)));
    }
    if (
      resource === "documents" &&
      item === "process" &&
      !action &&
      request.method === "POST"
    )
      return fileReply(await processDocuments(context, await body()));
    if (resource !== "files") return fileReply({ code: "missing" }, 404);
    if (!item && request.method === "GET") {
      const version = key(new URL(request.url).searchParams.get("version"));
      return fileReply({ rows: await listFiles(db, actor, version) });
    }
    if (item === "uploads" && request.method === "POST") {
      if (!action)
        return fileReply(await beginUpload(context, await body()), 201);
      if (subaction === "complete")
        return fileReply(await completeUpload(context, key(action)));
    }
    if (item === "cleanup" && !action && request.method === "POST")
      return fileReply(await cleanupFiles(context));
    if (!item || subaction) return fileReply({ code: "missing" }, 404);
    const fileId = key(item);
    if (
      action === "content" &&
      request.method === "PUT" &&
      storage.provider === "local"
    ) {
      const file = await localUploadFile(db, actor, fileId);
      const query = new URL(request.url).searchParams;
      if (
        !request.body ||
        !validUploadToken(
          secret,
          "q/" + fileId,
          file.bytes,
          Number(query.get("expires")),
          query.get("token") ?? "",
        )
      )
        return fileReply({ code: "forbidden" }, 403);
      const bytes = await boundedBytes(requestBytes(request.body), file.bytes);
      if (bytes.length !== file.bytes) return fileReply({ code: "size" }, 422);
      await storage.put("q/" + fileId, bytes, "application/octet-stream");
      return new Response(null, { status: 204, headers });
    }
    if (!action && request.method === "GET")
      return fileReply(fileSummary(await adminFile(db, actor, fileId)));
    if (!action && request.method === "DELETE")
      return fileReply(await changeFile(context, fileId, "remove"));
    if (
      request.method === "POST" &&
      (action === "scale" || action === "association")
    )
      return fileReply(await changeFile(context, fileId, action, await body()));
    if (
      request.method === "GET" &&
      (action === "preview" || action === "image")
    ) {
      const file = await adminFile(db, actor, fileId);
      if (action === "preview")
        return documentReply(
          await downloadAsset(file, storage, limits),
          file.filename,
        );
      return await imageReply(file, storage);
    }
    return fileReply({ code: "missing" }, 404);
  } catch (error) {
    if (error instanceof Error && error.message === "size")
      return fileReply({ code: "size" }, 422);
    return handleFileError(error);
  }
}

async function imageReply(
  file: typeof fileAssets.$inferSelect,
  storage: ObjectStorage,
) {
  if (
    !file.objectKey ||
    file.status !== "READY" ||
    !isImage(file.purpose) ||
    file.mediaType !== "image/webp" ||
    storage.provider !== file.provider
  )
    return fileReply({ code: "missing" }, 404);
  return bytesReply(await storage.get(file.objectKey, 2_000_000), "image/webp");
}

export async function publicImage(request: Request, fileId: string) {
  try {
    if (!id.safeParse(fileId).success)
      return fileReply({ code: "missing" }, 404);
    const identity = getIdentity();
    if (!identity) return fileReply({ code: "missing" }, 404);
    const { db, config } = identity;
    const [row] = await db
      .select({ asset: fileAssets, slug: patternVersions.slug })
      .from(fileAssets)
      .innerJoin(patternVersions, eq(fileAssets.versionId, patternVersions.id))
      .where(eq(fileAssets.id, fileId));
    const edition = row && (await publicEdition(db, row.slug));
    if (
      !row ||
      !edition ||
      edition.id !== row.asset.versionId ||
      !isImage(row.asset.purpose)
    )
      return fileReply({ code: "missing" }, 404);
    const env = fileStorage(config.origin, config.secret);
    if (!env) return fileReply({ code: "missing" }, 404);
    if (
      !(await consumeAuthLimit(
        db,
        rateKey(
          config.secret,
          "public-image",
          requestRateIdentifier(request.headers),
        ),
        180,
        60_000,
      ))
    )
      return fileReply({ code: "busy" }, 429);
    return await imageReply(row.asset, env.storage);
  } catch (error) {
    return handleFileError(error);
  }
}

const downloadInput = z.object({
  sizeId: id,
  edition: z.coerce.number().int().positive().max(2147483647),
});

export async function customerDownload(request: Request, path: string) {
  try {
    const identity = getIdentity();
    if (!identity) return fileReply({ code: "missing" }, 404);
    const { db, config } = identity;
    if (request.headers.get("origin") !== config.origin)
      return fileReply({ code: "forbidden" }, 403);
    if (
      !(await consumeAuthLimit(
        db,
        rateKey(
          config.secret,
          "public-download",
          requestRateIdentifier(request.headers),
        ),
        25,
        60_000,
      ))
    )
      return fileReply({ code: "busy" }, 429);
    const form = request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded");
    const input = downloadInput.parse(
      form && request.body
        ? Object.fromEntries(
            new URLSearchParams(
              Buffer.from(
                await boundedBytes(requestBytes(request.body), 1024),
              ).toString("utf8"),
            ),
          )
        : await readJson(request, 1024),
    );
    const version = await publicEdition(db, path);
    if (!version) return fileReply({ code: "missing" }, 404);
    const [file] = await db
      .select()
      .from(fileAssets)
      .where(
        and(
          eq(fileAssets.versionId, version.id),
          eq(fileAssets.sizeId, input.sizeId),
          eq(fileAssets.purpose, "PATTERN_A4_PDF"),
          eq(fileAssets.status, "READY"),
        ),
      );
    if (
      version.edition !== input.edition ||
      !freeDownload(version.price, version.state, Boolean(file))
    ) {
      await recordAudit(db, {
        action: "download.rejected",
        resourceType: "pattern",
        resourceId: version.patternId,
        metadata: {
          reason: version.price !== "FREE" ? "premium" : "unavailable",
        },
      });
      return fileReply(
        { code: version.price !== "FREE" ? "premium" : "missing" },
        version.price !== "FREE" ? 403 : 404,
      );
    }
    const env = fileStorage(config.origin, config.secret);
    if (!env) return fileReply({ code: "storage" }, 503);
    const delivery = await downloadAsset(file, env.storage, env.config.limits);
    if (delivery.url && request.headers.get("accept") === "application/json")
      return fileReply({ url: delivery.url });
    return documentReply(delivery, file.filename);
  } catch (error) {
    if (error instanceof Error && error.message === "size")
      return fileReply({ code: "size" }, 422);
    return handleFileError(error);
  }
}

export async function libraryRequest(request: Request) {
  try {
    const identity = getIdentity();
    const actor =
      identity &&
      (await authorize(request.headers, undefined, undefined, identity));
    if (!identity || !actor) return fileReply({ code: "missing" }, 404);
    if (request.method === "GET")
      return fileReply({
        rows: await libraryPatterns(identity.db, actor.user.id),
      });
    if (request.headers.get("origin") !== identity.config.origin)
      return fileReply({ code: "forbidden" }, 403);
    if (
      !(await consumeAuthLimit(
        identity.db,
        rateKey(identity.config.secret, "library", actor.user.id),
        40,
        60_000,
      ))
    )
      return fileReply({ code: "busy" }, 429);
    if (request.method === "POST") {
      const data = z.object({ slug }).parse(await readJson(request, 1024));
      const version = await publicEdition(identity.db, data.slug);
      if (!version || version.price !== "FREE")
        return fileReply({ code: "missing" }, 404);
      await identity.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${actor.user.id}, 500520))`,
        );
        const eligible = await tx
          .select({ id: fileAssets.id })
          .from(fileAssets)
          .where(
            and(
              eq(fileAssets.versionId, version.id),
              eq(fileAssets.purpose, "PATTERN_A4_PDF"),
              eq(fileAssets.status, "READY"),
            ),
          )
          .limit(1);
        if (!eligible.length) throw new FileError("missing", 404);
        const owner = eq(savedPatterns.userId, actor.user.id);
        const existing = await tx
          .select()
          .from(savedPatterns)
          .where(and(owner, eq(savedPatterns.patternId, version.patternId)))
          .limit(1);
        if (existing.length) return;
        const [total] = await tx
          .select({ value: count() })
          .from(savedPatterns)
          .where(owner);
        if (total.value >= 100) throw new FileError("size");
        await tx
          .insert(savedPatterns)
          .values({ userId: actor.user.id, patternId: version.patternId })
          .onConflictDoNothing();
      });
      return fileReply({ saved: true });
    }
    const { patternId } = z
      .object({ patternId: id })
      .parse(await readJson(request, 1024));
    await identity.db
      .delete(savedPatterns)
      .where(
        and(
          eq(savedPatterns.userId, actor.user.id),
          eq(savedPatterns.patternId, patternId),
        ),
      );
    return fileReply({ removed: true });
  } catch (error) {
    return handleFileError(error);
  }
}
