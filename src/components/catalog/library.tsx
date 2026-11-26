"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { catalogMessages as m } from "@/i18n/catalog-ro";
import {
  categoryInput,
  measurementInput,
  parseLength,
  showLength,
  type Definition,
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

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  position: number;
  archived: boolean;
};
type Row = Category | Definition;

export function Library({
  kind,
  rows,
}: {
  kind: "categories" | "measurements";
  rows: Row[];
}) {
  const [selected, setSelected] = useState<Row | null>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const category = kind === "categories";
  const select = (row: Row | null) => {
    setSelected(row);
    setError("");
  };

  async function save(value: object, id?: string) {
    setPending(true);
    setError("");
    try {
      const result = await mutateCatalog(kind, { id, value });
      if (result.ok) window.location.reload();
      else setError(messageFor(result.data.code));
    } catch {
      setError(m.errors.unavailable);
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "");
    const unit = field("unit") === "cm" ? "cm" : "mm";
    const base = {
      name: field("name"),
      description: field("description"),
      archived: selected?.archived ?? false,
    };
    const value = category
      ? categoryInput.safeParse({
          ...base,
          slug: field("slug"),
          position: Number(field("position")),
        })
      : measurementInput.safeParse({
          ...base,
          key: field("key"),
          instructions: field("instructions"),
          unit,
          min: parseLength(field("min"), unit),
          max: parseLength(field("max"), unit),
          precision: field("precision") ? Number(field("precision")) : null,
        });
    if (!value.success) {
      setError(
        [
          m.errors.invalid,
          ...value.error.issues
            .map((issue) => {
              const key = issue.path[0];
              return key === "key"
                ? m.key
                : key === "slug"
                  ? m.slug
                  : key === "name"
                    ? m.name
                    : key === "min"
                      ? m.min
                      : key === "max"
                        ? m.max
                        : key === "position"
                          ? m.position
                          : key === "precision"
                            ? m.precision
                            : "";
            })
            .filter(Boolean),
        ].join(" "),
      );
      return;
    }
    await save(value.data, selected?.id);
  }

  return (
    <div className="grid gap-5">
      <div>
        <Button onClick={() => select(null)}>
          {category ? m.categoryNew : m.measurementNew}
        </Button>
      </div>
      {selected !== undefined && (
        <form
          key={selected?.id ?? "new"}
          method="post"
          onSubmit={submit}
          className={panelClass}
        >
          <h3 className="font-serif text-2xl">
            {selected ? m.edit : category ? m.categoryNew : m.measurementNew}
          </h3>
          <fieldset disabled={pending} className="grid gap-4">
            <Field label={m.name}>
              <Input
                name="name"
                required
                maxLength={120}
                defaultValue={selected?.name}
              />
            </Field>
            {category ? (
              <>
                <Field label={m.slug} help={m.slugHint}>
                  <Input
                    name="slug"
                    required
                    maxLength={100}
                    defaultValue={
                      selected && "slug" in selected ? selected.slug : ""
                    }
                  />
                </Field>
                <Field label={m.position}>
                  <Input
                    name="position"
                    required
                    type="number"
                    min={0}
                    max={100000}
                    defaultValue={
                      selected && "position" in selected ? selected.position : 0
                    }
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label={m.key} help={m.slugHint}>
                  <Input
                    name="key"
                    required
                    readOnly={Boolean(selected)}
                    maxLength={100}
                    defaultValue={
                      selected && "key" in selected ? selected.key : ""
                    }
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={m.unit}>
                    <select
                      name="unit"
                      className={inputClass}
                      defaultValue={
                        selected && "unit" in selected ? selected.unit : "cm"
                      }
                    >
                      <option>cm</option>
                      <option>mm</option>
                    </select>
                  </Field>
                  <Field label={m.precision}>
                    <Input
                      name="precision"
                      type="number"
                      min={0}
                      max={3}
                      defaultValue={
                        selected && "precision" in selected
                          ? (selected.precision ?? "")
                          : ""
                      }
                    />
                  </Field>
                  <Field label={m.min}>
                    <Input
                      name="min"
                      required
                      inputMode="decimal"
                      defaultValue={
                        selected && "unit" in selected
                          ? showLength(selected.min, selected.unit)
                          : ""
                      }
                    />
                  </Field>
                  <Field label={m.max}>
                    <Input
                      name="max"
                      required
                      inputMode="decimal"
                      defaultValue={
                        selected && "unit" in selected
                          ? showLength(selected.max, selected.unit)
                          : ""
                      }
                    />
                  </Field>
                </div>
                <Field label={m.instructions}>
                  <Textarea
                    name="instructions"
                    maxLength={4000}
                    defaultValue={
                      selected && "instructions" in selected
                        ? selected.instructions
                        : ""
                    }
                  />
                </Field>
              </>
            )}
            <Field label={m.description}>
              <Textarea
                name="description"
                maxLength={2000}
                defaultValue={selected?.description}
              />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">{pending ? m.saving : m.save}</Button>
              <Button
                onClick={() => {
                  setSelected(undefined);
                  setError("");
                }}
              >
                {m.cancel}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className="text-accent">
          {error}
        </p>
      )}
      {rows.length === 0 && <p>{m.noResults}</p>}
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            className="flex flex-wrap items-center justify-between gap-3 py-4"
            key={row.id}
          >
            <div>
              <p className="font-semibold">{row.name}</p>
              <p className="text-sm text-muted-foreground">
                {row.archived ? m.archived : m.active} ·{" "}
                {"slug" in row
                  ? row.slug + " · " + row.position
                  : row.key +
                    " · " +
                    showLength(row.min, row.unit) +
                    "–" +
                    showLength(row.max, row.unit) +
                    " " +
                    row.unit}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending} onClick={() => select(row)}>
                {m.edit}
              </Button>
              <Button
                disabled={pending}
                onClick={() => {
                  if (row.archived || window.confirm(m.archivalConfirm))
                    void save({ ...row, archived: !row.archived }, row.id);
                }}
              >
                {row.archived ? m.restore : m.archive}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
