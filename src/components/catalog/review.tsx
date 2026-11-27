import { catalogMessages as m } from "@/i18n/catalog-ro";
import {
  measurementFields,
  overlappingSizes,
  readiness,
} from "@/modules/catalog/lifecycle";
import {
  currencyDigits,
  showLength,
  type Definition,
  type Draft,
} from "@/modules/catalog/validation";
import { panelClass } from "./classes";
import { MeasureField } from "@/components/customer/measurement-field";

export function MeasurementPreview({
  draft,
  definitions,
}: {
  draft: Draft;
  definitions: Definition[];
}) {
  const fields = measurementFields(draft, definitions);
  return (
    <section className={panelClass}>
      <h4 className="font-serif text-xl">{m.measurementPreview}</h4>
      <p className="text-sm">{m.previewHint}</p>
      {fields.length === 0 && <p>{m.noResults}</p>}
      {fields.map((field) => (
        <MeasureField key={field.id} field={field} prefix="preview" />
      ))}
    </section>
  );
}

export function PatternReview({
  draft,
  definitions,
  category,
  active,
  documentsReady = false,
}: {
  draft: Draft;
  definitions: Definition[];
  category?: string;
  active: boolean;
  documentsReady?: boolean;
}) {
  const checks = readiness(draft, active, documentsReady);
  const fields = measurementFields(draft, definitions);
  const overlap = overlappingSizes(draft);
  const { pricing } = draft;
  const money =
    pricing.kind === "PREMIUM" && pricing.amount && pricing.currency
      ? " · " +
        new Intl.NumberFormat("ro", {
          style: "currency",
          currency: pricing.currency,
        }).format(pricing.amount / 10 ** currencyDigits(pricing.currency))
      : "";
  return (
    <div className="grid gap-5">
      <section className={panelClass}>
        <h3 className="font-serif text-2xl">{draft.name || m.unnamed}</h3>
        <p>
          {category || m.unselected} ·{" "}
          {draft.difficulty ? m[draft.difficulty] : m.missing} ·{" "}
          {m[pricing.kind]}
          {money}
        </p>
        {draft.slug && (
          <p className="break-all">
            {m.slug} · {draft.slug}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words font-medium">
          {draft.short}
        </p>
        <p className="whitespace-pre-wrap break-words">{draft.description}</p>
        {draft.materials && (
          <div>
            <h4 className="font-semibold">{m.materials}</h4>
            <p className="whitespace-pre-wrap break-words">{draft.materials}</p>
          </div>
        )}
        {draft.instructions && (
          <div>
            <h4 className="font-semibold">{m.instructions}</h4>
            <p className="whitespace-pre-wrap break-words">
              {draft.instructions}
            </p>
          </div>
        )}
        <div>
          <h4 className="font-semibold">{m.steps[1]}</h4>
          <ul className="list-disc pl-5">
            {draft.pieces.map((item) => (
              <li key={item.id}>
                {item.name || m.unnamed} · {item.quantity}
                {item.fabric && " · " + item.fabric}
                {item.fold && " · " + m.fold}
                {item.mirrored && " · " + m.mirrored}
                {item.seam !== null &&
                  " · " + m.seam + " " + showLength(item.seam)}
                {item.grainline && (
                  <p>
                    {m.grainline} · {item.grainline}
                  </p>
                )}
                {item.description && (
                  <p className="whitespace-pre-wrap break-words">
                    {item.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-semibold">{m.steps[3]}</h4>
          <ul className="list-disc pl-5">
            {draft.variants.map((v) => (
              <li key={v.id}>
                {v.label || m.unnamed}
                <ul className="pl-4">
                  {v.ranges.map((range) => {
                    const field = fields.find(
                      (f) => f.id === range.definitionId,
                    );
                    return (
                      <li key={range.definitionId}>
                        {field?.name} · {showLength(range.min, field?.unit)}–
                        {showLength(range.max, field?.unit)} {field?.unit}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <MeasurementPreview draft={draft} definitions={definitions} />
      <section className={panelClass}>
        <h3 className="font-serif text-2xl">{m.readiness}</h3>
        <ul className="divide-y divide-border">
          {Object.entries(checks).map(([key, complete]) => (
            <li key={key} className="flex flex-wrap justify-between gap-2 py-2">
              {m.checkLabels[key as keyof typeof m.checkLabels]}{" "}
              <strong className={complete ? "" : "text-accent"}>
                {complete ? m.ready : m.missing}
              </strong>
            </li>
          ))}
        </ul>
        {overlap.map(([a, b], i) => (
          <p key={i} className="text-accent">
            {m.overlap} {a || m.unnamed} / {b || m.unnamed}.
          </p>
        ))}
        {!documentsReady && (
          <p className="text-sm text-muted-foreground">
            {m.publicationBlocked}
          </p>
        )}
      </section>
    </div>
  );
}
