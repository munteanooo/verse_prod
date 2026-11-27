import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  readStorageEnvironment,
  type StorageConfig,
} from "../../config/storage-environment";

const keyPattern = /^[qo]\/([a-f0-9-]{36})$/;
type Stored = { size: number; contentType?: string };
type Delivery =
  { url: string; bytes?: never } | { bytes: Uint8Array; url?: never };
export interface ObjectStorage {
  provider: "local" | "s3";
  authorizeUpload(
    key: string,
    bytes: number,
    expires: Date,
  ): Promise<{ url: string; headers: Record<string, string> }>;
  head(key: string): Promise<Stored>;
  get(key: string, max: number): Promise<Uint8Array>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  delivery(key: string, max: number, disposition: string): Promise<Delivery>;
}

export async function boundedBytes(
  stream: AsyncIterable<Uint8Array>,
  max: number,
) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of stream) {
    length += chunk.byteLength;
    if (length > max) throw new Error("size");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

const mac = (secret: string, key: string, size: number, expires: number) =>
  createHmac("sha256", secret)
    .update(JSON.stringify(["file-upload", key, size, expires]))
    .digest();
export function validUploadToken(
  secret: string,
  key: string,
  size: number,
  expires: number,
  token: string,
) {
  if (
    !keyPattern.test(key) ||
    !key.startsWith("q/") ||
    !Number.isSafeInteger(expires) ||
    expires < Date.now() ||
    !/^[a-f0-9]{64}$/.test(token)
  )
    return false;
  return timingSafeEqual(
    mac(secret, key, size, expires),
    Buffer.from(token, "hex"),
  );
}

export function localStorage(
  root: string,
  origin: string,
  secret: string,
): ObjectStorage {
  const path = (key: string) => {
    if (!keyPattern.test(key)) throw new Error("key");
    return join(root, key);
  };
  const head = async (key: string) => {
    const info = await stat(path(key));
    if (!info.isFile()) throw new Error("missing");
    return { size: info.size };
  };
  const get = async (key: string, max: number) => {
    if ((await head(key)).size > max) throw new Error("size");
    const bytes = await readFile(path(key));
    if (bytes.byteLength > max) throw new Error("size");
    return bytes;
  };
  return {
    provider: "local",
    async authorizeUpload(key, size, expires) {
      const [, id] = keyPattern.exec(key) ?? [];
      if (!id) throw new Error("key");
      const url = new URL("/api/v1/admin/files/" + id + "/content", origin);
      url.searchParams.set("expires", String(expires.getTime()));
      url.searchParams.set(
        "token",
        mac(secret, key, size, expires.getTime()).toString("hex"),
      );
      return { url: url.href, headers: {} };
    },
    head,
    get,
    async put(key, bytes) {
      const file = path(key);
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
    },
    async delete(key) {
      try {
        await unlink(path(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
    async delivery(key, max) {
      return { bytes: await get(key, max) };
    },
  };
}

function s3Storage(
  config: Extract<StorageConfig, { provider: "s3" }>,
): ObjectStorage {
  const client = new S3Client({
    endpoint: config.STORAGE_ENDPOINT,
    region: config.STORAGE_REGION,
    forcePathStyle: true,
    maxAttempts: 2,
    credentials: {
      accessKeyId: config.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const object = (Key: string) => {
    if (!keyPattern.test(Key)) throw new Error("key");
    return { Bucket: config.STORAGE_BUCKET, Key };
  };
  const timeout = () => ({ abortSignal: AbortSignal.timeout(5000) });
  return {
    provider: "s3",
    async authorizeUpload(key, bytes, expires) {
      const seconds = Math.floor((expires.getTime() - Date.now()) / 1000);
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({ ...object(key), ContentLength: bytes }),
        {
          expiresIn: Math.max(1, seconds),
          signableHeaders: new Set(["content-length"]),
        },
      );
      if (
        !new URL(url).searchParams
          .get("X-Amz-SignedHeaders")
          ?.split(";")
          .includes("content-length")
      )
        throw new Error("storage");
      return { url, headers: {} };
    },
    async head(key) {
      const item = await client.send(
        new HeadObjectCommand(object(key)),
        timeout(),
      );
      if (item.ContentLength === undefined) throw new Error("missing");
      return { size: item.ContentLength, contentType: item.ContentType };
    },
    async get(key, max) {
      const item = await client.send(
        new GetObjectCommand(object(key)),
        timeout(),
      );
      if (!item.Body || !(Symbol.asyncIterator in item.Body))
        throw new Error("missing");
      const stream = item.Body as AsyncIterable<Uint8Array> & {
        destroy?: () => void;
      };
      try {
        if (item.ContentLength === undefined || item.ContentLength > max)
          throw new Error("size");
        return await boundedBytes(stream, max);
      } finally {
        stream.destroy?.();
      }
    },
    async put(key, bytes, contentType) {
      if (!key.startsWith("o/")) throw new Error("key");
      await client.send(
        new PutObjectCommand({
          ...object(key),
          Body: bytes,
          ContentLength: bytes.byteLength,
          ContentType: contentType,
          CacheControl: "private, no-store",
          IfNoneMatch: "*",
        }),
        timeout(),
      );
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand(object(key)), timeout());
    },
    async delivery(key, _max, disposition) {
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          ...object(key),
          ResponseContentDisposition: disposition,
          ResponseContentType: "application/pdf",
          ResponseCacheControl: "private, no-store",
        }),
        { expiresIn: config.limits.downloadTtl },
      );
      return { url };
    },
  };
}

export function fileStorage(origin: string, secret: string) {
  const config = readStorageEnvironment(origin);
  if (!config) return;
  return {
    config,
    storage:
      config.provider === "local"
        ? localStorage(config.root, origin, secret)
        : s3Storage(config),
  };
}
