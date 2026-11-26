"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { project } from "@/config/project";
import { catalogMessages as m } from "@/i18n/catalog-ro";
import {
  measurementFields,
  overlappingSizes,
} from "@/modules/catalog/lifecycle";
import {
  currencies,
  currencyDigits,
  difficulties,
  draftInput,
  parseLength,
  parseMoney,
  showLength,
  type Definition,
  type Draft,
} from "@/modules/catalog/validation";
import {
  Field,
  Input,
  Textarea,
  inputClass,
  panelClass,
  messageFor,
  mutateCatalog,
} from "./controls";
import { PatternActions } from "./pattern-actions";
import { patternsHref } from "./paths";
import { MeasurementPreview, PatternReview } from "./review";

type Category = { id: string; name: string; archived: boolean };
type Collection = "pieces" | "measurements" | "variants";

function CollectionButtons({
  index,
  length,
  move,
  remove,
}: {
  index: number;
  length: number;
  move: (direction: number) => void;
  remove: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={index === 0} onClick={() => move(-1)}>
        {m.up}
      </Button>
      <Button disabled={index === length - 1} onClick={() => move(1)}>
        {m.down}
      </Button>
      <Button
        onClick={() => {
          if (window.confirm(m.removalConfirm)) remove();
        }}
      >
        {m.remove}
      </Button>
    </div>
  );
}

function LengthField({
  label,
  value,
  change,
  unit = "mm",
  required = false,
}: {
  label: string;
  value: number | null;
  change: (value: number | null) => void;
  unit?: "cm" | "mm";
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <Input
        inputMode="decimal"
        required={required}
        defaultValue={showLength(value, unit)}
        onChange={(event) =>
          change(
            event.target.value.trim()
              ? parseLength(event.target.value, unit)
              : required
                ? NaN
                : null,
          )
        }
      />
    </Field>
  );
}

const fields: Partial<Record<keyof Draft, string>> = {
  name: m.name,
  slug: m.slug,
  short: m.short,
  description: m.description,
  categoryId: m.category,
  difficulty: m.difficulty,
  materials: m.materials,
  instructions: m.instructions,
  pieces: m.steps[1],
  measurements: m.steps[2],
  variants: m.steps[3],
  pricing: m.steps[4],
};

export function Wizard({
  id,
  versionId,
  revision: initialRevision,
  initial,
  options,
  definitions: initialDefinitions,
}: {
  id: string;
  versionId: string;
  revision: number;
  initial: Draft;
  options: Category[];
  definitions: Definition[];
}) {
  const [draft, setDraft] = useState(initial);
  const [revision, setRevision] = useState(initialRevision);
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState("");
  const [library, setLibrary] = useState<Definition[]>();
  const [loadingDefinitions, setLoadingDefinitions] = useState(false);
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const category = options.find((item) => item.id === draft.categoryId);
  const definitions = library ?? initialDefinitions;
  const measureFields = measurementFields(draft, definitions);
  const overlap = overlappingSizes(draft);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setNotice("");
  }

  function row<K extends Collection>(
    key: K,
    index: number,
    value: Partial<Draft[K][number]>,
  ) {
    update(
      key,
      draft[key].map((item, i) =>
        i === index ? { ...item, ...value } : item,
      ) as Draft[K],
    );
  }

  function move<K extends Collection>(
    key: K,
    index: number,
    direction: number,
  ) {
    const reordered = [...draft[key]];
    [reordered[index], reordered[index + direction]] = [
      reordered[index + direction],
      reordered[index],
    ];
    update(key, reordered as Draft[K]);
  }

  function remove<K extends Collection>(key: K, index: number) {
    if (key === "measurements") {
      const definitionId = draft.measurements[index].definitionId;
      update(
        "variants",
        draft.variants.map((variant) => ({
          ...variant,
          ranges: variant.ranges.filter(
            (range) => range.definitionId !== definitionId,
          ),
        })),
      );
    }
    update(key, draft[key].filter((_, i) => i !== index) as Draft[K]);
  }

  function showError(issues: unknown) {
    const names = Array.isArray(issues)
      ? issues
          .map((issue) =>
            typeof issue === "string"
              ? fields[issue.split(".")[0] as keyof Draft]
              : undefined,
          )
          .filter(Boolean)
      : [];
    setError([m.errors.invalid, ...new Set(names)].join(" "));
  }

  async function save() {
    setError("");
    setNotice("");
    const validated = draftInput.safeParse(draft);
    if (!validated.success) {
      showError(validated.error.issues.map(({ path }) => path.join(".")));
      return;
    }
    setPending(true);
    try {
      const result = await mutateCatalog(
        "patterns/" + id,
        { versionId, revision, draft: validated.data },
        "PUT",
      );
      if (result.ok && typeof result.data.revision === "number") {
        setRevision(result.data.revision);
        setDirty(false);
        setNotice(m.saved);
      } else if (result.data.code === "invalid") showError(result.data.issues);
      else setError(messageFor(result.data.code));
    } catch {
      setError(m.errors.unavailable);
    } finally {
      setPending(false);
    }
  }

  async function refreshDefinitions() {
    setLoadingDefinitions(true);
    setError("");
    try {
      const response = await fetch(
        project.routes.api + project.routes.admin + "/measurements",
      );
      if (!response.ok) throw new Error("Measurement library unavailable");
      const result: { rows: Definition[] } = await response.json();
      const selected = new Set(
        draft.measurements.map(({ definitionId }) => definitionId),
      );
      setLibrary([
        ...definitions.filter(({ id }) => selected.has(id)),
        ...result.rows.filter(({ id }) => !selected.has(id)),
      ]);
      setChosen("");
      setNotice(m.refreshedMeasurements);
    } catch {
      setError(m.errors.unavailable);
    } finally {
      setLoadingDefinitions(false);
    }
  }

  function textField(
    key:
      "name" | "slug" | "short" | "description" | "materials" | "instructions",
    maxLength: number,
    multiline = false,
  ) {
    const props = {
      value: draft[key],
      maxLength,
      onChange: (event: { target: { value: string } }) =>
        update(key, event.target.value),
    };
    return (
      <Field
        key={key}
        label={fields[key]!}
        help={key === "slug" ? m.slugHint : undefined}
      >
        {multiline ? <Textarea {...props} /> : <Input {...props} />}
      </Field>
    );
  }

  function collection(key: Collection, index: number) {
    return (
      <CollectionButtons
        index={index}
        length={draft[key].length}
        move={(direction) => move(key, index, direction)}
        remove={() => remove(key, index)}
      />
    );
  }

  let content: ReactNode;
  if (step === 0)
    content = (
      <div className={panelClass}>
        {textField("name", 120)}
        {textField("slug", 100)}
        {textField("short", 500, true)}
        {textField("description", 8000, true)}
        <Field label={m.category}>
          <select
            className={inputClass}
            value={draft.categoryId ?? ""}
            onChange={(e) => update("categoryId", e.target.value || null)}
          >
            <option value="">{m.select}</option>
            {options.map((c) => (
              <option
                key={c.id}
                value={c.id}
                disabled={c.archived && c.id !== draft.categoryId}
              >
                {c.name}
                {c.archived ? " · " + m.archived : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label={m.difficulty}>
          <select
            className={inputClass}
            value={draft.difficulty ?? ""}
            onChange={(e) =>
              update(
                "difficulty",
                difficulties.find((value) => value === e.target.value) ?? null,
              )
            }
          >
            <option value="">{m.select}</option>
            {difficulties.map((value) => (
              <option key={value} value={value}>
                {m[value]}
              </option>
            ))}
          </select>
        </Field>
        {textField("materials", 4000, true)}
        {textField("instructions", 16000, true)}
      </div>
    );
  else if (step === 1)
    content = (
      <div className="grid gap-4">
        {draft.pieces.map((piece, index) => (
          <section key={piece.id} className={panelClass}>
            <h4 className="font-serif text-xl">
              {m.piece} {index + 1}
            </h4>
            <Field label={m.name}>
              <Input
                value={piece.name}
                maxLength={120}
                onChange={(e) => row("pieces", index, { name: e.target.value })}
              />
            </Field>
            <Field label={m.description}>
              <Textarea
                value={piece.description}
                maxLength={2000}
                onChange={(e) =>
                  row("pieces", index, { description: e.target.value })
                }
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={m.quantity}>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={Number.isNaN(piece.quantity) ? "" : piece.quantity}
                  onChange={(e) =>
                    row("pieces", index, { quantity: e.target.valueAsNumber })
                  }
                />
              </Field>
              <Field label={m.fabric}>
                <Input
                  value={piece.fabric}
                  maxLength={120}
                  onChange={(e) =>
                    row("pieces", index, { fabric: e.target.value })
                  }
                />
              </Field>
              <Field label={m.grainline}>
                <Input
                  value={piece.grainline}
                  maxLength={500}
                  onChange={(e) =>
                    row("pieces", index, { grainline: e.target.value })
                  }
                />
              </Field>
              <LengthField
                label={m.seam}
                value={piece.seam}
                change={(seam) => row("pieces", index, { seam })}
              />
            </div>
            <label>
              <input
                type="checkbox"
                checked={piece.fold}
                onChange={(e) =>
                  row("pieces", index, { fold: e.target.checked })
                }
              />{" "}
              {m.fold}
            </label>
            <label>
              <input
                type="checkbox"
                checked={piece.mirrored}
                onChange={(e) =>
                  row("pieces", index, { mirrored: e.target.checked })
                }
              />{" "}
              {m.mirrored}
            </label>
            {collection("pieces", index)}
          </section>
        ))}
        <div>
          <Button
            disabled={draft.pieces.length >= 50}
            onClick={() =>
              update("pieces", [
                ...draft.pieces,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  description: "",
                  quantity: 1,
                  fabric: "",
                  fold: false,
                  mirrored: false,
                  grainline: "",
                  seam: null,
                },
              ])
            }
          >
            {m.addPiece}
          </Button>
        </div>
      </div>
    );
  else if (step === 2)
    content = (
      <div className="grid gap-4">
        <div className={panelClass}>
          <Field label={m.measurements}>
            <select
              className={inputClass}
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
            >
              <option value="">{m.select}</option>
              {definitions
                .filter(
                  (entry) =>
                    !entry.archived &&
                    !draft.measurements.some(
                      (selected) => selected.definitionId === entry.id,
                    ),
                )
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} ({entry.unit})
                  </option>
                ))}
            </select>
          </Field>
          <div>
            <Button
              disabled={!chosen || draft.measurements.length >= 30}
              onClick={() => {
                update("measurements", [
                  ...draft.measurements,
                  {
                    definitionId: chosen,
                    required: true,
                    min: null,
                    max: null,
                  },
                ]);
                setChosen("");
              }}
            >
              {m.addMeasurement}
            </Button>
          </div>
          <a
            href={project.routes.admin + "/measurements"}
            className="text-link w-fit"
            target="_blank"
            rel="noreferrer"
          >
            {m.definitions}
          </a>
          <div>
            <Button
              disabled={loadingDefinitions}
              onClick={() => void refreshDefinitions()}
            >
              {loadingDefinitions
                ? m.loadingMeasurements
                : m.refreshMeasurements}
            </Button>
          </div>
        </div>
        {draft.measurements.map((measurement, index) => {
          const definition = definitions.find(
            (entry) => entry.id === measurement.definitionId,
          );
          return (
            <section key={measurement.definitionId} className={panelClass}>
              <h4 className="font-serif text-xl">
                {definition?.name ?? m.unnamed} ({definition?.unit})
              </h4>
              <p className="text-sm">
                {m.min} {showLength(definition?.min ?? null, definition?.unit)}{" "}
                · {m.max}{" "}
                {showLength(definition?.max ?? null, definition?.unit)}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={measurement.required}
                  onChange={(e) =>
                    row("measurements", index, { required: e.target.checked })
                  }
                />{" "}
                {m.required}
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <LengthField
                  label={m.min}
                  unit={definition?.unit}
                  value={measurement.min}
                  change={(min) => row("measurements", index, { min })}
                />
                <LengthField
                  label={m.max}
                  unit={definition?.unit}
                  value={measurement.max}
                  change={(max) => row("measurements", index, { max })}
                />
              </div>
              {collection("measurements", index)}
            </section>
          );
        })}
        <MeasurementPreview draft={draft} definitions={definitions} />
      </div>
    );
  else if (step === 3)
    content = (
      <div className="grid gap-4">
        {draft.variants.map((variant, index) => (
          <section key={variant.id} className={panelClass}>
            <h4 className="font-serif text-xl">
              {m.size} {index + 1}
            </h4>
            <Field label={m.label}>
              <Input
                value={variant.label}
                maxLength={80}
                onChange={(e) =>
                  row("variants", index, { label: e.target.value })
                }
              />
            </Field>
            {measureFields.map((field) => {
              const range = variant.ranges.find(
                (item) => item.definitionId === field.id,
              );
              const changeRange = (key: "min" | "max", value: number | null) =>
                row("variants", index, {
                  ranges: variant.ranges.map((item) =>
                    item.definitionId === field.id
                      ? { ...item, [key]: value ?? NaN }
                      : item,
                  ),
                });
              return (
                <div
                  key={field.id}
                  className="grid gap-2 border-t border-border pt-3"
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(range)}
                      onChange={(e) =>
                        row("variants", index, {
                          ranges: e.target.checked
                            ? [
                                ...variant.ranges,
                                {
                                  definitionId: field.id,
                                  min: field.min,
                                  max: field.max,
                                },
                              ]
                            : variant.ranges.filter(
                                (item) => item.definitionId !== field.id,
                              ),
                        })
                      }
                    />{" "}
                    {field.name} ({field.unit})
                  </label>
                  {range && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <LengthField
                        label={m.min}
                        unit={field.unit}
                        value={range.min}
                        required
                        change={(value) => changeRange("min", value)}
                      />
                      <LengthField
                        label={m.max}
                        unit={field.unit}
                        value={range.max}
                        required
                        change={(value) => changeRange("max", value)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {collection("variants", index)}
          </section>
        ))}
        {overlap.map(([a, b], index) => (
          <p key={index} className="text-accent">
            {m.overlap} {a || m.unnamed} / {b || m.unnamed}.
          </p>
        ))}
        <div>
          <Button
            disabled={draft.variants.length >= 30}
            onClick={() =>
              update("variants", [
                ...draft.variants,
                { id: crypto.randomUUID(), label: "", ranges: [] },
              ])
            }
          >
            {m.addSize}
          </Button>
        </div>
      </div>
    );
  else if (step === 4) {
    const price = draft.pricing;
    const currency = price.currency ?? "RON";
    content = (
      <div className={panelClass}>
        <Field label={m.steps[4]}>
          <select
            className={inputClass}
            value={price.kind}
            onChange={(e) =>
              update("pricing", {
                kind: e.target.value === "PREMIUM" ? "PREMIUM" : "FREE",
                amount: null,
                currency: e.target.value === "PREMIUM" ? "RON" : null,
              })
            }
          >
            <option value="FREE">{m.FREE}</option>
            <option value="PREMIUM">{m.PREMIUM}</option>
          </select>
        </Field>
        {price.kind === "PREMIUM" && (
          <>
            <Field label={m.currency}>
              <select
                className={inputClass}
                value={currency}
                onChange={(e) =>
                  update("pricing", {
                    ...price,
                    currency: e.target.value,
                    amount: null,
                  })
                }
              >
                {currencies.map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </select>
            </Field>
            <Field label={m.amount}>
              <Input
                key={currency}
                inputMode="decimal"
                defaultValue={
                  price.amount === null || Number.isNaN(price.amount)
                    ? ""
                    : String(price.amount / 10 ** currencyDigits(currency))
                }
                onChange={(e) =>
                  update("pricing", {
                    ...price,
                    amount: e.target.value.trim()
                      ? parseMoney(e.target.value, currency)
                      : null,
                    currency,
                  })
                }
              />
            </Field>
          </>
        )}
      </div>
    );
  } else
    content = (
      <div className="grid gap-4">
        <PatternReview
          draft={draft}
          definitions={definitions}
          category={category?.name}
          active={Boolean(category && !category.archived)}
        />
        <PatternActions
          id={id}
          archived={false}
          draft
          disabled={dirty || pending}
        />
      </div>
    );

  return (
    <div className="grid gap-5">
      <nav aria-label={m.steps[5]}>
        <ol className="flex flex-wrap gap-2">
          {m.steps.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                aria-current={index === step ? "step" : undefined}
                className="min-h-11 rounded-sm border border-border px-3 text-sm aria-[current=step]:bg-muted aria-[current=step]:font-semibold"
                onClick={() => setStep(index)}
              >
                {index + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div>
        <h3 className="font-serif text-2xl">{m.steps[step]}</h3>
        <p className="mt-2">{m.stepHints[step]}</p>
      </div>
      <fieldset disabled={pending || loadingDefinitions} className="min-w-0">
        {content}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        {step > 0 && (
          <Button onClick={() => setStep(step - 1)}>{m.previous}</Button>
        )}
        {step < m.steps.length - 1 && (
          <Button onClick={() => setStep(step + 1)}>{m.next}</Button>
        )}
        <Button disabled={pending} onClick={() => void save()}>
          {pending ? m.saving : m.saveDraft}
        </Button>
        <a className="text-link" href={patternsHref + "/" + id + "/preview"}>
          {m.preview}
        </a>
      </div>
      {error && (
        <p className="text-accent" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
