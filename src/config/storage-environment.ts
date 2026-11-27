import { z } from "zod";
import { isAbsolute } from "node:path";
import { isLoopback } from "./identity-environment";

const positive = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);
const limits = z.object({
  STORAGE_PDF_BYTES: positive(8_000_000, 1000, 16_000_000),
  STORAGE_IMAGE_BYTES: positive(3_000_000, 1000, 8_000_000),
  STORAGE_SOURCE_PAGES: positive(8, 1, 16),
  STORAGE_SOURCE_MM: positive(1800, 297, 3000),
  STORAGE_OUTPUT_PAGES: positive(70, 2, 150),
  STORAGE_OUTPUT_BYTES: positive(12_000_000, 1000, 24_000_000),
  STORAGE_WORKER_MS: positive(6500, 500, 12000),
  STORAGE_CONCURRENT: positive(2, 1, 4),
});
const s3Config = z.object({
  STORAGE_ENDPOINT: z.url({ protocol: /^https$/ }).refine((value) => {
    const url = URL.parse(value);
    return (
      url?.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }),
  STORAGE_REGION: z.string().min(1).max(60),
  STORAGE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
});

export function readStorageEnvironment(
  origin: string,
  env: Record<string, string | undefined> = process.env,
) {
  if (!env.STORAGE_PROVIDER) return;
  const result = limits.safeParse(env);
  if (!result.success) throw new Error("Invalid storage limits.");
  const v = result.data;
  const settings = {
    pdfBytes: v.STORAGE_PDF_BYTES,
    imageBytes: v.STORAGE_IMAGE_BYTES,
    sourcePages: v.STORAGE_SOURCE_PAGES,
    sourceMm: v.STORAGE_SOURCE_MM,
    outputPages: v.STORAGE_OUTPUT_PAGES,
    outputBytes: v.STORAGE_OUTPUT_BYTES,
    workerMs: v.STORAGE_WORKER_MS,
    concurrent: v.STORAGE_CONCURRENT,
    uploadTtl: 300,
    downloadTtl: 60,
  };
  if (env.STORAGE_PROVIDER === "local") {
    if (
      env.VERCEL ||
      !isLoopback(new URL(origin).hostname) ||
      !env.STORAGE_LOCAL_ROOT ||
      !isAbsolute(env.STORAGE_LOCAL_ROOT)
    )
      throw new Error(
        "Local storage requires an explicit loopback configuration.",
      );
    return {
      provider: "local" as const,
      root: env.STORAGE_LOCAL_ROOT,
      limits: settings,
    };
  }
  const s3 = s3Config.safeParse(env);
  if (env.STORAGE_PROVIDER !== "s3" || !s3.success)
    throw new Error("Invalid storage configuration.");
  return { provider: "s3" as const, ...s3.data, limits: settings };
}
export type StorageConfig = NonNullable<
  ReturnType<typeof readStorageEnvironment>
>;
export type DocumentLimits = StorageConfig["limits"];
