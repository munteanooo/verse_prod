import { z } from "zod";
import { id, parseLength, showLength, units } from "../catalog/validation";

export type MeasurementField = {
  id: string;
  key: string;
  name: string;
  description: string;
  instructions: string;
  unit: (typeof units)[number];
  precision: number | null;
  min: number;
  max: number;
  required: boolean;
};
export type Size = {
  id: string;
  label: string;
  ranges: { definitionId: string; min: number; max: number }[];
};
export type Value = {
  definitionId: string;
  unit: (typeof units)[number];
  text: string;
};
export const submittedValues = z
  .array(
    z.object({
      definitionId: id,
      unit: z.enum(units),
      text: z.string().trim().max(24),
    }),
  )
  .max(100);
export const profileInput = z.object({
  name: z.string().trim().min(1).max(80),
  values: submittedValues,
  revision: z.number().int().min(0).max(2_147_483_646).optional(),
});

export function measurementSchema(fields: MeasurementField[]) {
  const definitions = new Map(fields.map((field) => [field.id, field]));
  return submittedValues
    .superRefine((inputs, ctx) => {
      const seen = new Set<string>();
      inputs.forEach(({ definitionId, text, unit }, index) => {
        const field = definitions.get(definitionId);
        const canonical = parseLength(text, unit);
        const fraction = text.replace(",", ".").split(".")[1]?.length ?? 0;
        if (
          !field ||
          seen.has(definitionId) ||
          unit !== field.unit ||
          !Number.isInteger(canonical) ||
          canonical < field.min ||
          canonical > field.max ||
          (field.precision !== null && fraction > field.precision)
        )
          ctx.addIssue({ code: "custom", path: [index], message: "invalid" });
        seen.add(definitionId);
      });
    })
    .transform((values) =>
      values.map((value) => ({
        definitionId: value.definitionId,
        length: parseLength(value.text, value.unit),
      })),
    );
}

export function profileText(length: number, field: MeasurementField) {
  const value = showLength(length, field.unit);
  return measurementSchema([field]).safeParse([
    { definitionId: field.id, unit: field.unit, text: value },
  ]).success
    ? value
    : undefined;
}

export type Recommendation = {
  status:
    "invalid" | "insufficient" | "incomplete" | "single" | "multiple" | "none";
  compatible: string[];
  fields: string[];
};

export function recommendSize(
  fields: MeasurementField[],
  sizes: Size[],
  inputs: unknown,
): Recommendation {
  const validated = measurementSchema(fields).safeParse(inputs);
  if (!validated.success) {
    const list = Array.isArray(inputs) ? inputs : [];
    const invalid = new Set(
      validated.error.issues.flatMap((issue) => {
        const value = list[Number(issue.path[0])];
        return value &&
          typeof value.definitionId === "string" &&
          fields.some((field) => field.id === value.definitionId)
          ? [value.definitionId as string]
          : [];
      }),
    );
    return { status: "invalid" as const, compatible: [], fields: [...invalid] };
  }
  const values = new Map(
    validated.data.map(({ definitionId, length }) => [definitionId, length]),
  );
  const required = fields.filter((field) => field.required);
  const missing = required
    .filter((field) => !values.has(field.id))
    .map((field) => field.id);
  if (missing.length || !values.size)
    return { status: "insufficient" as const, compatible: [], fields: missing };

  const applicable = (size: Size) =>
    [...values].map(([id, length]) => ({
      length,
      range: size.ranges.find((r) => r.definitionId === id),
    }));
  if (
    !sizes.length ||
    sizes.some(
      (size) =>
        !size.label ||
        applicable(size).some(
          ({ range }) =>
            !range ||
            !Number.isSafeInteger(range.min) ||
            !Number.isSafeInteger(range.max) ||
            range.min < 0 ||
            range.max < range.min,
        ),
    )
  )
    return { status: "incomplete" as const, compatible: [], fields: [] };

  const compatible = sizes
    .filter((size) =>
      applicable(size).every(
        ({ length, range }) =>
          range && range.min <= length && length <= range.max,
      ),
    )
    .map(({ id }) => id);
  return {
    status:
      compatible.length === 1
        ? ("single" as const)
        : compatible.length > 1
          ? ("multiple" as const)
          : ("none" as const),
    compatible,
    fields: [],
  };
}
