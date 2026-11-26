import { can, type Role } from "../identity/policy";
import type { Definition, Draft, states } from "./validation";

type State = (typeof states)[number];

export function mayEdit(role: Role, actorId: string, ownerId: string) {
  return (
    can(role, "pattern:update:any") ||
    can(role, "pattern:update:own", { actorId, ownerId })
  );
}

export function mayTransition(from: State, to: State) {
  return (
    (from === "DRAFT" && (to === "PUBLISHED" || to === "ARCHIVED")) ||
    (from === "PUBLISHED" && to === "ARCHIVED")
  );
}

export function measurementFields(draft: Draft, definitions: Definition[]) {
  return draft.measurements.flatMap((item) => {
    const definition = definitions.find(
      (entry) => entry.id === item.definitionId,
    );
    return definition
      ? [
          {
            ...definition,
            ...item,
            min: item.min ?? definition.min,
            max: item.max ?? definition.max,
          },
        ]
      : [];
  });
}

export function readiness(
  draft: Draft,
  activeCategory: boolean,
  validatedDocuments: boolean,
) {
  return {
    general: Boolean(
      draft.name &&
      draft.slug &&
      draft.short &&
      draft.description &&
      draft.difficulty &&
      draft.materials &&
      draft.instructions,
    ),
    category: activeCategory,
    pieces: draft.pieces.length > 0 && draft.pieces.every((item) => item.name),
    measurements: draft.measurements.length > 0,
    sizes:
      draft.variants.length > 0 &&
      draft.variants.every(
        (item) =>
          item.label &&
          draft.measurements
            .filter((m) => m.required)
            .every((m) =>
              item.ranges.some(
                (range) => range.definitionId === m.definitionId,
              ),
            ),
      ),
    pricing:
      draft.pricing.kind === "FREE" ||
      Boolean(draft.pricing.amount && draft.pricing.currency),
    documents: validatedDocuments,
  };
}

export function overlappingSizes(draft: Draft) {
  return draft.variants.flatMap((left, index) =>
    draft.variants.slice(index + 1).flatMap((right) => {
      const shared = left.ranges.flatMap((a) =>
        right.ranges
          .filter((b) => b.definitionId === a.definitionId)
          .map((b) => a.min <= b.max && b.min <= a.max),
      );
      return shared.length && shared.every(Boolean)
        ? [[left.label, right.label]]
        : [];
    }),
  );
}

export function publicationDecision(
  draft: Draft,
  state: State,
  activeCategory: boolean,
  validatedDocuments: boolean,
) {
  const checks = readiness(draft, activeCategory, validatedDocuments);
  const transition = mayTransition(state, "PUBLISHED");
  const overlap = overlappingSizes(draft);
  return {
    checks,
    transition,
    overlap,
    allowed:
      transition &&
      Object.values(checks).every(Boolean) &&
      overlap.length === 0,
  };
}
