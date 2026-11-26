import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  measurementSchema,
  profileText,
  recommendSize,
  type MeasurementField,
  type Size,
} from "@/modules/customer/measurements";

const field: MeasurementField = {
  id: randomUUID(),
  key: "custom-length",
  name: "Custom length",
  description: "",
  instructions: "",
  unit: "cm",
  precision: 1,
  required: true,
  min: 400000,
  max: 1300000,
};
const optional = {
  ...field,
  id: randomUUID(),
  required: false,
  unit: "mm" as const,
  min: 1000,
};
const fields = [field, optional];
const value = (text: string) => ({
  definitionId: field.id,
  unit: field.unit,
  text,
});
const sizes: Size[] = [
  {
    id: randomUUID(),
    label: "One",
    ranges: [{ definitionId: field.id, min: 700000, max: 800000 }],
  },
  {
    id: randomUUID(),
    label: "Two",
    ranges: [{ definitionId: field.id, min: 800000, max: 900000 }],
  },
];

describe("schema-driven measurements", () => {
  it("converts decimal display values to canonical integers exactly", () => {
    const input = measurementSchema(fields).parse([
      value("79,5"),
      { definitionId: optional.id, unit: "mm", text: "7.1" },
    ]);
    expect(input.map(({ length }) => length)).toEqual([795000, 7100]);
    expect(profileText(795000, { ...field, unit: "mm" })).toBe("795");
    expect(profileText(795001, field)).toBeUndefined();
  });
  it.each(["79.55", "1e2", "-80", "130.1", "NaN"])(
    "rejects %s for the version's precision and bounds",
    (text) => {
      expect(recommendSize(fields, sizes, [value(text)])).toMatchObject({
        status: "invalid",
        fields: [field.id],
      });
    },
  );
  it("rejects unsupported or mismatched units and duplicate values", () => {
    expect(
      recommendSize(fields, sizes, [{ ...value("79"), unit: "in" }]).status,
    ).toBe("invalid");
    expect(
      recommendSize(fields, sizes, [{ ...value("79"), unit: "mm" }]).status,
    ).toBe("invalid");
    expect(
      recommendSize(fields, sizes, [value("79"), value("80")]).status,
    ).toBe("invalid");
  });
});

describe("standard size recommendation", () => {
  it("reports single, multiple and no exact match with inclusive ranges", () => {
    expect(recommendSize(fields, sizes, [value("70")])).toMatchObject({
      status: "single",
      compatible: [sizes[0].id],
    });
    expect(recommendSize(fields, sizes, [value("80")])).toMatchObject({
      status: "multiple",
      compatible: sizes.map(({ id }) => id),
    });
    expect(recommendSize(fields, sizes, [value("95")]).status).toBe("none");
  });
  it("requires mandatory fields and does not infer missing size ranges", () => {
    expect(recommendSize(fields, sizes, []).status).toBe("insufficient");
    expect(
      recommendSize(fields, [{ ...sizes[0], ranges: [] }], [value("79")])
        .status,
    ).toBe("incomplete");
    expect(
      recommendSize(fields, sizes, [
        value("79"),
        { definitionId: optional.id, unit: "mm", text: "8" },
      ]).status,
    ).toBe("incomplete");
  });
});
