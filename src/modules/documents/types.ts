import { z } from "zod";
import { id } from "../catalog/validation";

export const purposes = [
  "COVER_IMAGE",
  "GALLERY_IMAGE",
  "MEASUREMENT_ILLUSTRATION",
  "PATTERN_SOURCE_PDF",
  "PATTERN_A4_PDF",
  "PATTERN_PREVIEW",
] as const;
export const uploadInput = z.object({
  versionId: id,
  purpose: z.enum(purposes.filter((item) => item !== "PATTERN_A4_PDF")),
  filename: z.string().min(1).max(160),
  bytes: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  sizeId: id.optional(),
  pieceId: id.optional(),
  definitionId: id.optional(),
  mode: z.enum(["A4", "FULL"]).optional(),
  alt: z.string().trim().max(200).default(""),
});
export const processInput = z.object({
  versionId: id,
  sizeId: id,
  landscape: z.boolean().default(false),
  margin: z.number().min(12).max(32).default(12),
  overlapX: z.number().min(0).max(30).default(8),
  overlapY: z.number().min(0).max(30).default(8),
});
export const scaleInput = z.object({
  reference: z.string().trim().min(2).max(200),
});
export const associationInput = z.object({
  alt: z.string().trim().min(1).max(200),
  position: z.number().int().min(0).max(1000),
});
export const lifecycleInput = z.object({
  versionId: id,
  revision: z.number().int().min(0).max(2147483647),
});
export const isSource = (purpose: string) => purpose === "PATTERN_SOURCE_PDF";
export const isImage = (purpose: string) =>
  purpose !== "PATTERN_SOURCE_PDF" && purpose !== "PATTERN_A4_PDF";

export function safeFilename(value: string) {
  return (
    value
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/^\.+/, "")
      .slice(0, 120) || "document"
  );
}

export function freeDownload(priceKind: string, state: string, ready: boolean) {
  return priceKind === "FREE" && state === "PUBLISHED" && ready;
}
