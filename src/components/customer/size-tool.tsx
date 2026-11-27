"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { inputClass, panelClass } from "@/components/catalog/classes";
import { project } from "@/config/project";
import { profilesApi } from "./paths";
import { catalogMessages as c } from "@/i18n/catalog-ro";
import { documentMessages as d } from "@/i18n/documents-ro";
import { customerMessages as m } from "@/i18n/customer-ro";
import { showLength } from "@/modules/catalog/validation";
import {
  profileText,
  type MeasurementField,
  type Size,
  type Value,
  type recommendSize,
} from "@/modules/customer/measurements";
import type { Profile } from "@/modules/customer/profiles";
import { MeasureField } from "./measurement-field";

type Result = ReturnType<typeof recommendSize>;

export function SizeTool({
  slug,
  edition,
  downloads,
  premium,
  fields,
  sizes,
  profiles,
  authenticated,
}: {
  slug: string;
  edition: number;
  downloads: { sizeId: string; pages: number | null }[];
  premium: boolean;
  fields: MeasurementField[];
  sizes: Size[];
  profiles: { id: string; name: string }[];
  authenticated: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [selectedProfile, setSelectedProfile] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const selectedDocument = downloads.find(
    ({ sizeId }) => sizeId === selectedSize,
  );
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  async function download() {
    if (!selectedDocument || premium) return;
    setDownloadPending(true);
    setDownloadError("");
    try {
      const response = await fetch(
        project.routes.api + "/patterns/" + slug + "/download",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ sizeId: selectedSize, edition }),
        },
      );
      if (!response.ok) throw new Error("Download unavailable");
      if (response.headers.get("content-type") === "application/pdf") {
        const objectUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download =
          /filename="([a-zA-Z0-9._-]+)"/.exec(
            response.headers.get("content-disposition") ?? "",
          )?.[1] ?? "verse-a4.pdf";
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      } else {
        const result: { url: string } = await response.json();
        const destination = new URL(result.url);
        if (destination.protocol !== "https:")
          throw new Error("Download unavailable");
        window.location.assign(destination.href);
      }
    } catch {
      setDownloadError(d.unavailable);
    } finally {
      setDownloadPending(false);
    }
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice("");
    try {
      const submitted: Value[] = fields.flatMap(({ id, unit }) =>
        values[id]?.trim()
          ? [{ definitionId: id, unit, text: values[id] }]
          : [],
      );
      const response = await fetch(
        project.routes.api + "/patterns/" + slug + "/recommend-size",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: submitted }),
        },
      );
      if (!response.ok) throw new Error("Size request failed");
      const recommendation: Result = await response.json();
      setResult(recommendation);
    } catch {
      setResult(undefined);
      setNotice(m.error);
    } finally {
      setPending(false);
    }
  }

  async function loadProfile() {
    setPending(true);
    setNotice("");
    try {
      const response = await fetch(profilesApi + "/" + selectedProfile, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Profile request failed");
      const profile: Profile = await response.json();
      const entries = fields.flatMap((field) => {
        const match = profile.values.find(
          ({ field: item }) => item.id === field.id,
        );
        const text = match && profileText(match.length, field);
        return text === undefined ? [] : [[field.id, text]];
      });
      setValues(Object.fromEntries(entries));
      setResult(undefined);
      setNotice(m.profileLoaded);
    } catch {
      setNotice(m.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid min-w-0 gap-6">
      <h2 className="font-serif text-3xl">{c.measurements}</h2>
      <form
        method="post"
        noValidate
        onSubmit={calculate}
        className={panelClass}
      >
        <p>{m.guest}</p>
        {authenticated && (
          <a className="text-link w-fit" href={project.routes.measurements}>
            {m.profiles}
          </a>
        )}
        <fieldset disabled={pending} className="grid min-w-0 gap-4">
          {profiles.length > 0 && (
            <div className="grid gap-2">
              <label>
                {m.chooseProfile}
                <select
                  className={inputClass}
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value)}
                >
                  <option value="">{c.select}</option>
                  {profiles.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <Button
                  disabled={!selectedProfile}
                  onClick={() => void loadProfile()}
                >
                  {m.loadProfile}
                </Button>
              </div>
            </div>
          )}
          {fields.map((field) => (
            <MeasureField
              key={field.id}
              field={field}
              value={values[field.id] ?? ""}
              invalid={result?.fields.includes(field.id)}
              change={(value) => {
                setValues((current) => ({ ...current, [field.id]: value }));
                setResult(undefined);
                setNotice("");
              }}
            />
          ))}
          <div>
            <Button type="submit" disabled={!fields.length}>
              {pending ? m.loading : m.calculate}
            </Button>
          </div>
        </fieldset>
        <div role="status">
          {notice || (result && m[result.status])}
          {result && result.compatible.length > 0 && (
            <ul className="list-disc pl-5">
              {sizes
                .filter((size) => result.compatible.includes(size.id))
                .map(({ id, label }) => (
                  <li key={id}>{label}</li>
                ))}
            </ul>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{m.fit}</p>
      </form>
      <div className="grid min-w-0 gap-3">
        <h2 className="font-serif text-3xl">{m.sizeTable}</h2>
        {!sizes.length ? (
          <p>{m.incomplete}</p>
        ) : (
          <>
            <div
              className="overflow-x-auto rounded-sm border border-border"
              tabIndex={0}
              role="region"
              aria-label={m.sizeTable}
            >
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{m.sizeTable}</caption>
                <thead className="bg-muted">
                  <tr>
                    <th scope="col" className="p-3">
                      {c.measurements}
                    </th>
                    {sizes.map((size) => (
                      <th scope="col" key={size.id} className="p-3">
                        {size.label || c.unnamed}
                        {result?.compatible.includes(size.id) && (
                          <span className="block">{m.compatible}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => (
                    <tr key={field.id} className="border-t border-border">
                      <th scope="row" className="p-3">
                        {field.name} ({field.unit})
                      </th>
                      {sizes.map((size) => {
                        const range = size.ranges.find(
                          ({ definitionId }) => definitionId === field.id,
                        );
                        return (
                          <td key={size.id} className="min-w-24 p-3">
                            {range
                              ? showLength(range.min, field.unit) +
                                "–" +
                                showLength(range.max, field.unit)
                              : m.rangeMissing}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="max-w-xs">
              {m.selectSize}
              <select
                className={inputClass}
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
              >
                <option value="">{c.select}</option>
                {sizes.map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label || c.unnamed}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="grid gap-2">
          {premium ? (
            <p>{d.premium}</p>
          ) : selectedDocument ? (
            <div className="grid gap-3">
              <p>
                {d.a4}
                {selectedDocument.pages &&
                  " · " + d.pages + " " + selectedDocument.pages}
              </p>
              <div>
                <Button
                  disabled={downloadPending}
                  onClick={() => void download()}
                >
                  {downloadPending ? m.loading : d.download}
                </Button>
              </div>
              {downloadError && (
                <p role="alert" className="text-accent">
                  {downloadError}
                </p>
              )}
            </div>
          ) : (
            <p>
              {downloads.length && !selectedSize
                ? d.selectToDownload
                : d.unavailable}
            </p>
          )}
          {downloads.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {d.print} {d.calibration} {d.align}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
