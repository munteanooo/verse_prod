import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const name = text(120);
export const id = z.uuid();
export const slug = z
  .string()
  .trim()
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const dimension = z.number().int().min(0).max(10_000_000);
const order = z.number().int().min(0).max(100_000);
export const units = ["mm", "cm"] as const;
export const difficulties = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export const states = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export const categoryInput = z.object({
  name: name.min(1),
  slug,
  description: text(2000),
  position: order,
  archived: z.boolean(),
});

const bounds = { min: dimension, max: dimension };
export const measurementInput = z
  .object({
    key: slug,
    name: name.min(1),
    description: text(2000),
    instructions: text(4000),
    unit: z.enum(units),
    precision: z.number().int().min(0).max(3).nullable(),
    ...bounds,
    archived: z.boolean(),
  })
  .refine((v) => v.min <= v.max, { path: ["max"] });

const piece = z.object({
  id,
  name,
  description: text(2000),
  quantity: z.number().int().min(1).max(100),
  fabric: text(120),
  fold: z.boolean(),
  mirrored: z.boolean(),
  grainline: text(500),
  seam: dimension.nullable(),
});
const measurement = z
  .object({
    definitionId: id,
    required: z.boolean(),
    min: dimension.nullable(),
    max: dimension.nullable(),
  })
  .refine((v) => v.min === null || v.max === null || v.min <= v.max, {
    path: ["max"],
  });
const range = z
  .object({ definitionId: id, ...bounds })
  .refine((v) => v.min <= v.max, { path: ["max"] });
const variant = z.object({
  id,
  label: text(80),
  ranges: z.array(range).max(30),
});
export const currencies = Intl.supportedValuesOf("currency");
export const pricing = z
  .object({
    kind: z.enum(["FREE", "PREMIUM"]),
    amount: z.number().int().positive().max(999_999_999).nullable(),
    currency: z
      .string()
      .refine((code) => currencies.includes(code))
      .nullable(),
  })
  .refine(
    (v) => v.kind !== "FREE" || (v.amount === null && v.currency === null),
    { path: ["kind"] },
  );

export const draftInput = z
  .object({
    name,
    slug: z.union([z.literal(""), slug]),
    short: text(500),
    description: text(8000),
    categoryId: id.nullable(),
    difficulty: z.enum(difficulties).nullable(),
    materials: text(4000),
    instructions: text(16000),
    pricing,
    pieces: z.array(piece).max(50),
    measurements: z.array(measurement).max(30),
    variants: z.array(variant).max(30),
  })
  .superRefine((draft, ctx) => {
    const unique = (values: string[], path: (string | number)[]) => {
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: "custom", path, message: "duplicate" });
    };
    unique(
      draft.pieces.map((p) => p.id),
      ["pieces"],
    );
    unique(
      draft.measurements.map((m) => m.definitionId),
      ["measurements"],
    );
    unique(
      draft.variants.map((v) => v.id),
      ["variants"],
    );
    unique(
      draft.variants.filter((v) => v.label).map((v) => v.label.toLowerCase()),
      ["variants"],
    );
    const definitions = new Set(draft.measurements.map((m) => m.definitionId));
    draft.variants.forEach((v, i) => {
      unique(
        v.ranges.map((r) => r.definitionId),
        ["variants", i, "ranges"],
      );
      if (v.ranges.some((r) => !definitions.has(r.definitionId)))
        ctx.addIssue({
          code: "custom",
          path: ["variants", i, "ranges"],
          message: "reference",
        });
    });
  });

export type Draft = z.infer<typeof draftInput>;
export type Definition = z.infer<typeof measurementInput> & { id: string };
export const emptyDraft: Draft = {
  name: "",
  slug: "",
  short: "",
  description: "",
  categoryId: null,
  difficulty: null,
  materials: "",
  instructions: "",
  pricing: { kind: "FREE", amount: null, currency: null },
  pieces: [],
  measurements: [],
  variants: [],
};

export function parseLength(
  value: string,
  unit: (typeof units)[number] = "mm",
) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,5}(?:\.\d{1,3})?$/.test(normalized)) return NaN;
  const [whole, fraction = ""] = normalized.split(".");
  return (
    (Number(whole) * 1000 + Number(fraction.padEnd(3, "0"))) *
    (unit === "cm" ? 10 : 1)
  );
}

export function showLength(
  value: number | null,
  unit: (typeof units)[number] = "mm",
) {
  return value === null ? "" : String(value / (unit === "cm" ? 10000 : 1000));
}

export function currencyDigits(currency: string) {
  return (
    new Intl.NumberFormat("ro", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

export function parseMoney(value: string, currency: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,9}(?:\.\d{1,4})?$/.test(normalized)) return NaN;
  const [whole, fraction = ""] = normalized.split(".");
  const digits = currencyDigits(currency);
  if (fraction.length > digits) return NaN;
  return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0"));
}
