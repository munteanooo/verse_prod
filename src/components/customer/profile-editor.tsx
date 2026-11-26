"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { inputClass, panelClass } from "@/components/catalog/classes";
import { project } from "@/config/project";
import { catalogMessages as c } from "@/i18n/catalog-ro";
import { customerMessages as m } from "@/i18n/customer-ro";
import { showLength } from "@/modules/catalog/validation";
import {
  measurementSchema,
  type MeasurementField,
  type Value,
} from "@/modules/customer/measurements";
import type { Profile } from "@/modules/customer/profiles";
import { MeasureField } from "./measurement-field";
import { profilesApi } from "./paths";

export function ProfileEditor({
  definitions,
  existing,
}: {
  definitions: MeasurementField[];
  existing?: Profile;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [revision, setRevision] = useState(existing?.revision ?? 0);
  const [rows, setRows] = useState<{ field: MeasurementField; text: string }[]>(
    existing?.values.map(({ field, length }) => ({
      field,
      text: showLength(length, field.unit),
    })) ?? [],
  );
  const [choice, setChoice] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const target = profilesApi + (existing ? "/" + existing.id : "");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const values: Value[] = rows.map(({ field, text }) => ({
      definitionId: field.id,
      unit: field.unit,
      text,
    }));
    if (
      !measurementSchema(rows.map(({ field }) => field)).safeParse(values)
        .success
    ) {
      setError(m.invalid);
      return;
    }
    setPending(true);
    try {
      const response = await fetch(target, {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, revision, values }),
      });
      if (!response.ok) throw new Error("Profile save failed");
      if (!existing) {
        const created: { id: string } = await response.json();
        window.location.assign(project.routes.measurements + "/" + created.id);
      } else {
        setRevision(revision + 1);
        setNotice(m.saved);
      }
    } catch {
      setError(m.profileError);
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(m.confirmDelete)) return;
    setPending(true);
    try {
      const result = await fetch(target, { method: "DELETE" });
      if (!result.ok) throw new Error("Profile deletion failed");
      window.location.assign(project.routes.measurements);
    } catch {
      setError(m.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={save} className={panelClass}>
      <fieldset disabled={pending} className="grid min-w-0 gap-4">
        <label>
          {m.profileName}
          <input
            className={inputClass}
            maxLength={80}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {c.measurements}
          <select
            className={inputClass}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value="">{c.select}</option>
            {definitions
              .filter(({ id }) => !rows.some(({ field }) => field.id === id))
              .map(({ id, name, unit }) => (
                <option key={id} value={id}>
                  {name} ({unit})
                </option>
              ))}
          </select>
        </label>
        <div>
          <Button
            disabled={!choice || rows.length >= 100}
            onClick={() => {
              const field = definitions.find(({ id }) => id === choice);
              if (field) setRows([...rows, { field, text: "" }]);
              setChoice("");
            }}
          >
            {m.addMeasurement}
          </Button>
        </div>
        {rows.map(({ field, text }, index) => (
          <div
            key={field.id}
            className="grid gap-2 border-t border-border pt-4"
          >
            <MeasureField
              field={field}
              value={text}
              change={(text) =>
                setRows(
                  rows.map((row, i) => (i === index ? { ...row, text } : row)),
                )
              }
            />
            <div>
              <Button
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
              >
                {m.remove}
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-3">
          <Button type="submit">{pending ? m.loading : c.save}</Button>
          {existing && (
            <Button onClick={() => void remove()}>{m.delete}</Button>
          )}
        </div>
      </fieldset>
      <p role="status">{notice}</p>
      {error && (
        <p role="alert" className="text-accent">
          {error}
        </p>
      )}
    </form>
  );
}
