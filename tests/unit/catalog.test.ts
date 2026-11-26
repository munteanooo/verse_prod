import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  mayEdit,
  mayTransition,
  measurementFields,
  overlappingSizes,
  publicationDecision,
  readiness,
} from "@/modules/catalog/lifecycle";
import {
  categoryInput,
  draftInput,
  emptyDraft,
  measurementInput,
  parseLength,
  parseMoney,
  pricing,
  type Draft,
} from "@/modules/catalog/validation";

const definition = {
  id: randomUUID(),
  key: "waist",
  name: "Waist",
  description: "",
  instructions: "Measure at the waist",
  unit: "cm" as const,
  min: 400_000,
  max: 1_500_000,
  precision: 1,
  archived: false,
};

describe("catalog validation", () => {
  it("validates slugs and nonnegative category order", () => {
    expect(
      categoryInput.safeParse({
        name: " Skirts ",
        slug: "wrap-skirts",
        description: "",
        position: 2,
        archived: false,
      }).success,
    ).toBe(true);
    expect(
      categoryInput.safeParse({
        name: "Skirts",
        slug: "Bad Slug",
        description: "",
        position: -1,
        archived: false,
      }).success,
    ).toBe(false);
  });

  it("converts decimal lengths to exact micrometres and validates definition bounds", () => {
    expect(parseLength("8,125", "cm")).toBe(81_250);
    expect(parseLength("0.001", "mm")).toBe(1);
    expect(parseLength("Infinity")).toBeNaN();
    expect(measurementInput.safeParse(definition).success).toBe(true);
    expect(
      measurementInput.safeParse({ ...definition, max: definition.min - 1 })
        .success,
    ).toBe(false);
  });

  it("accepts incomplete drafts but rejects invalid quantity and size references", () => {
    expect(draftInput.safeParse(emptyDraft).success).toBe(true);
    const piece = {
      id: randomUUID(),
      name: "Front",
      description: "",
      quantity: 0,
      fabric: "",
      fold: true,
      mirrored: false,
      grainline: "",
      seam: 1000,
    };
    expect(
      draftInput.safeParse({ ...emptyDraft, pieces: [piece] }).success,
    ).toBe(false);
    const range = { definitionId: definition.id, min: 800_000, max: 700_000 };
    const draft = {
      ...emptyDraft,
      variants: [{ id: randomUUID(), label: "Short", ranges: [range] }],
    };
    expect(draftInput.safeParse(draft).success).toBe(false);
    expect(
      draftInput.safeParse({
        ...draft,
        measurements: [
          { definitionId: definition.id, required: true, min: null, max: null },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates integer currency minor units without floating point arithmetic", () => {
    expect(parseMoney("19,95", "RON")).toBe(1995);
    expect(parseMoney("19.95", "JPY")).toBeNaN();
    expect(
      pricing.safeParse({ kind: "PREMIUM", amount: 1995, currency: "RON" })
        .success,
    ).toBe(true);
    expect(
      pricing.safeParse({ kind: "PREMIUM", amount: 19.95, currency: "ZZZ" })
        .success,
    ).toBe(false);
    expect(
      pricing.safeParse({ kind: "FREE", amount: 100, currency: "RON" }).success,
    ).toBe(false);
  });
});

describe("catalog lifecycle", () => {
  const draft: Draft = {
    ...emptyDraft,
    name: "Skirt",
    slug: "skirt",
    short: "Short",
    description: "Details",
    materials: "Linen",
    instructions: "Cut",
    difficulty: "BEGINNER",
    pieces: [
      {
        id: randomUUID(),
        name: "Front",
        description: "",
        quantity: 1,
        fabric: "",
        fold: false,
        mirrored: false,
        grainline: "",
        seam: null,
      },
    ],
    measurements: [
      { definitionId: definition.id, required: true, min: 600_000, max: null },
    ],
    variants: [
      {
        id: randomUUID(),
        label: "A",
        ranges: [{ definitionId: definition.id, min: 600_000, max: 800_000 }],
      },
      {
        id: randomUUID(),
        label: "B",
        ranges: [{ definitionId: definition.id, min: 800_000, max: 950_000 }],
      },
    ],
  };

  it("builds customer preview fields from definition and pattern override data", () => {
    expect(measurementFields(draft, [definition])).toEqual([
      expect.objectContaining({
        name: "Waist",
        unit: "cm",
        min: 600_000,
        max: 1_500_000,
        required: true,
        instructions: "Measure at the waist",
      }),
    ]);
  });

  it("reports overlapping sizes and separates document readiness from metadata", () => {
    expect(overlappingSizes(draft)).toEqual([["A", "B"]]);
    expect(
      Object.entries(readiness(draft, true, false))
        .filter(([, ready]) => !ready)
        .map(([key]) => key),
    ).toEqual(["documents"]);
    expect(Object.values(readiness(draft, true, true)).every(Boolean)).toBe(
      true,
    );
    expect(readiness(emptyDraft, false, false).general).toBe(false);
  });

  it("requires an eligible transition, validated documents and unambiguous sizes for publication", () => {
    const unambiguous = { ...draft, variants: draft.variants.slice(0, 1) };
    expect(publicationDecision(unambiguous, "DRAFT", true, true).allowed).toBe(
      true,
    );
    expect(publicationDecision(unambiguous, "DRAFT", true, false).allowed).toBe(
      false,
    );
    expect(
      publicationDecision(unambiguous, "PUBLISHED", true, true).allowed,
    ).toBe(false);
    expect(publicationDecision(draft, "DRAFT", true, true).allowed).toBe(false);
  });

  it("only allows forward lifecycle transitions and restricts designer ownership", () => {
    expect(mayTransition("DRAFT", "PUBLISHED")).toBe(true);
    expect(mayTransition("PUBLISHED", "DRAFT")).toBe(false);
    expect(mayTransition("ARCHIVED", "PUBLISHED")).toBe(false);
    expect(mayEdit("DESIGNER", "a", "a")).toBe(true);
    expect(mayEdit("DESIGNER", "a", "b")).toBe(false);
    expect(mayEdit("CUSTOMER", "a", "a")).toBe(false);
    expect(mayEdit("ADMIN", "a", "b")).toBe(true);
  });
});
