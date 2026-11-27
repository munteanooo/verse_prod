"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { project } from "@/config/project";
import { catalogMessages as c } from "@/i18n/catalog-ro";
import { documentMessages as m } from "@/i18n/documents-ro";
import type { FileSummary } from "@/modules/documents/service";
import type { Draft } from "@/modules/catalog/validation";
import type { MeasurementField } from "@/modules/customer/measurements";
import {
  Field,
  Input,
  inputClass,
  panelClass,
  messageFor,
  mutateCatalog,
} from "./controls";

const base = project.routes.api + project.routes.admin + "/files";
export const fileMessage = (code: unknown) =>
  typeof code === "string" && Object.hasOwn(m.errors, code)
    ? m.errors[code as keyof typeof m.errors]
    : messageFor(code);

const labels = {
  COVER_IMAGE: m.cover,
  GALLERY_IMAGE: m.gallery,
  PATTERN_PREVIEW: m.piece,
  MEASUREMENT_ILLUSTRATION: m.measurement,
  PATTERN_SOURCE_PDF: m.source,
  PATTERN_A4_PDF: m.a4,
};
type FileResult = { ok: boolean; data: Record<string, unknown> };

export async function fetchFiles(versionId: string) {
  const response = await fetch(base + "?version=" + versionId, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("File list unavailable");
  const result: { rows: FileSummary[] } = await response.json();
  return result.rows;
}

export function filesReady(
  files: FileSummary[],
  draft: Draft,
  revision: number,
) {
  return (
    files.some(
      (file) => file.purpose === "COVER_IMAGE" && file.status === "READY",
    ) &&
    !files.some((file) => file.status === "PENDING") &&
    draft.variants.length > 0 &&
    draft.variants.every(({ id }) =>
      files.some(
        (file) =>
          file.purpose === "PATTERN_A4_PDF" &&
          file.sizeId === id &&
          file.status === "READY" &&
          file.revision === revision,
      ),
    )
  );
}

export function FilePanel({
  versionId,
  revision,
  step,
  files,
  refresh,
  draft,
  fields,
  readonly = false,
  dirty = false,
}: {
  versionId: string;
  revision: number;
  step: number;
  files: FileSummary[];
  refresh?: () => Promise<void>;
  draft: Draft;
  fields: MeasurementField[];
  readonly?: boolean;
  dirty?: boolean;
}) {
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const image = [0, 1, 2].includes(step);
  const visible = files.filter((file) =>
    step === 0
      ? ["COVER_IMAGE", "GALLERY_IMAGE"].includes(file.purpose)
      : step === 1
        ? file.purpose === "PATTERN_PREVIEW"
        : step === 2
          ? file.purpose === "MEASUREMENT_ILLUSTRATION"
          : step === 3
            ? ["PATTERN_SOURCE_PDF", "PATTERN_A4_PDF"].includes(file.purpose)
            : true,
  );
  const blocked = Boolean(pending || dirty || readonly);
  const sizeName = (id: string | null) =>
    draft.variants.find((size) => size.id === id)?.label;
  const pieceName = (id: string | null) =>
    draft.pieces.find((piece) => piece.id === id)?.name;

  async function operation(
    label: string,
    action: () => Promise<FileResult>,
    success?: string,
  ) {
    setPending(label);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (!result.ok || result.data.status === "REJECTED")
        setError(fileMessage(result.data.reason ?? result.data.code));
      else if (success) setNotice(success);
      await refresh?.();
    } catch {
      setError(c.errors.unavailable);
    } finally {
      setPending("");
    }
  }
  function action(
    event: FormEvent<HTMLFormElement>,
    callback: (data: FormData) => void,
  ) {
    event.preventDefault();
    callback(new FormData(event.currentTarget));
  }

  async function upload(data: FormData): Promise<FileResult> {
    const file = data.get("file");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > (image ? 8_000_000 : 16_000_000)
    )
      return { ok: false, data: { code: "size" } };
    const checksum = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
      ),
    )
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const request = await mutateCatalog("files/uploads", {
      versionId,
      filename: file.name,
      bytes: file.size,
      checksum,
      purpose:
        step === 0
          ? data.get("purpose")
          : step === 1
            ? "PATTERN_PREVIEW"
            : step === 2
              ? "MEASUREMENT_ILLUSTRATION"
              : "PATTERN_SOURCE_PDF",
      alt: String(data.get("alt") ?? ""),
      sizeId: data.get("sizeId") || undefined,
      pieceId: data.get("pieceId") || undefined,
      definitionId: data.get("definitionId") || undefined,
      mode: data.get("mode") || undefined,
    });
    if (!request.ok) return request;
    const target = new URL(request.data.url);
    const response = await fetch(target, {
      method: "PUT",
      body: file,
      headers: request.data.headers,
      credentials:
        target.origin === window.location.origin ? "same-origin" : "omit",
    });
    if (!response.ok)
      return {
        ok: false,
        data: { code: response.status === 413 ? "size" : "storage" },
      };
    return mutateCatalog("files/uploads/" + request.data.id + "/complete");
  }

  return (
    <section className={panelClass + " mt-4"}>
      <h4 className="font-serif text-2xl">{m.files}</h4>
      {dirty && !readonly && <p className="text-sm">{m.saveFirst}</p>}
      {!readonly && step < 4 && (
        <form
          method="post"
          onSubmit={(event) =>
            action(
              event,
              (data) =>
                void operation(m.uploading, () => upload(data), m.uploaded),
            )
          }
        >
          <fieldset disabled={blocked} className="grid gap-3">
            {step === 0 && (
              <Field label={m.files}>
                <select name="purpose" className={inputClass}>
                  <option value="COVER_IMAGE">{m.cover}</option>
                  <option value="GALLERY_IMAGE">{m.gallery}</option>
                </select>
              </Field>
            )}
            {step === 1 && (
              <Field label={c.piece}>
                <select name="pieceId" required className={inputClass}>
                  <option value="">{c.select}</option>
                  {draft.pieces.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || c.unnamed}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {step === 2 && (
              <Field label={m.measurement}>
                <select name="definitionId" required className={inputClass}>
                  <option value="">{c.select}</option>
                  {fields.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {step === 3 && (
              <>
                <Field label={c.size}>
                  <select required name="sizeId" className={inputClass}>
                    <option value="">{c.select}</option>
                    {draft.variants.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label || c.unnamed}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={c.piece}>
                  <select name="pieceId" className={inputClass}>
                    <option value="">{m.whole}</option>
                    {draft.pieces.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || c.unnamed}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={m.mode}>
                  <select name="mode" className={inputClass}>
                    <option value="FULL">{m.full}</option>
                    <option value="A4">{m.existing}</option>
                  </select>
                </Field>
              </>
            )}
            {image && (
              <Field label={m.alt}>
                <Input name="alt" required maxLength={200} />
              </Field>
            )}
            <Field label={m.choose}>
              <Input
                name="file"
                type="file"
                required
                accept={
                  image ? "image/jpeg,image/png,image/webp" : "application/pdf"
                }
              />
            </Field>
            <div>
              <Button type="submit">
                {pending === m.uploading ? pending : m.upload}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {visible.length > 0 && (
        <ul className="grid gap-3">
          {visible.map((file) => (
            <li
              key={file.id}
              className="grid gap-2 rounded-sm border border-border p-3 [overflow-wrap:anywhere]"
            >
              <p className="font-semibold">
                {labels[file.purpose]} · {file.filename} · {m[file.status]}
                {sizeName(file.sizeId) && " · " + sizeName(file.sizeId)}
                {pieceName(file.pieceId) && " · " + pieceName(file.pieceId)}
              </p>
              {file.reason && (
                <p className="text-accent">{fileMessage(file.reason)}</p>
              )}
              {file.status === "READY" &&
                !["PATTERN_A4_PDF", "PATTERN_SOURCE_PDF"].includes(
                  file.purpose,
                ) && (
                  <Image
                    unoptimized
                    src={base + "/" + file.id + "/image"}
                    alt={file.alt}
                    width={180}
                    height={140}
                    className="h-32 w-auto object-contain"
                  />
                )}
              {file.pages && (
                <p>
                  {m.pages} · {file.pages}
                </p>
              )}
              {file.geometry?.length ? (
                <p>
                  {m.dimensions} ·{" "}
                  {file.geometry
                    .map(
                      ({ width, height }) =>
                        width.toFixed(1) + " × " + height.toFixed(1),
                    )
                    .join("; ")}
                </p>
              ) : null}
              {file.overview?.map((entry) => (
                <p key={entry}>{entry}</p>
              ))}
              {file.purpose === "PATTERN_A4_PDF" &&
                file.revision !== revision && (
                  <p className="text-accent">{m.stale}</p>
                )}
              {file.purpose === "PATTERN_A4_PDF" && file.status === "READY" && (
                <a
                  href={base + "/" + file.id + "/preview"}
                  className="text-link w-fit"
                >
                  {m.preview}
                </a>
              )}
              {file.confirmedAt && <p>{m.scaleDone}</p>}
              {!readonly &&
                file.purpose === "PATTERN_SOURCE_PDF" &&
                file.status === "VALIDATED" &&
                !file.confirmedAt && (
                  <form
                    method="post"
                    onSubmit={(event) =>
                      action(
                        event,
                        (data) =>
                          void operation(
                            m.confirmScale,
                            () =>
                              mutateCatalog("files/" + file.id + "/scale", {
                                reference: data.get("reference"),
                              }),
                            m.scaleDone,
                          ),
                      )
                    }
                  >
                    <fieldset disabled={blocked} className="grid gap-2">
                      <Field label={m.scaleHint}>
                        <Input
                          name="reference"
                          required
                          minLength={2}
                          maxLength={200}
                        />
                      </Field>
                      <div>
                        <Button type="submit">{m.confirmScale}</Button>
                      </div>
                    </fieldset>
                  </form>
                )}
              {!readonly &&
                file.status === "READY" &&
                !["PATTERN_A4_PDF", "PATTERN_SOURCE_PDF"].includes(
                  file.purpose,
                ) && (
                  <form
                    method="post"
                    onSubmit={(event) =>
                      action(
                        event,
                        (data) =>
                          void operation(m.manage, () =>
                            mutateCatalog("files/" + file.id + "/association", {
                              alt: data.get("alt"),
                              position: Number(data.get("position")),
                            }),
                          ),
                      )
                    }
                  >
                    <fieldset
                      disabled={blocked}
                      className="grid items-end gap-2 sm:grid-cols-[1fr_7rem_auto]"
                    >
                      <Field label={m.alt}>
                        <Input
                          name="alt"
                          required
                          maxLength={200}
                          defaultValue={file.alt}
                        />
                      </Field>
                      <Field label={m.order}>
                        <Input
                          name="position"
                          type="number"
                          min={0}
                          max={1000}
                          required
                          defaultValue={file.position}
                        />
                      </Field>
                      <Button type="submit">{m.manage}</Button>
                    </fieldset>
                  </form>
                )}
              {!readonly && (
                <div>
                  <Button
                    disabled={blocked}
                    onClick={() => {
                      if (window.confirm(m.confirmRemove))
                        void operation(m.remove, () =>
                          mutateCatalog("files/" + file.id, {}, "DELETE"),
                        );
                    }}
                  >
                    {m.remove}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readonly && step === 3 && (
        <form
          method="post"
          onSubmit={(event) =>
            action(
              event,
              (data) =>
                void operation(
                  m.generating,
                  () =>
                    mutateCatalog("documents/process", {
                      versionId,
                      sizeId: data.get("processSize"),
                      landscape: data.get("landscape") === "on",
                      margin: Number(data.get("margin")),
                      overlapX: Number(data.get("overlapX")),
                      overlapY: Number(data.get("overlapY")),
                    }),
                  m.generated,
                ),
            )
          }
        >
          <fieldset disabled={blocked} className="grid gap-3">
            <Field label={m.generate}>
              <select className={inputClass} name="processSize" required>
                <option value="">{c.select}</option>
                {draft.variants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label || c.unnamed}
                  </option>
                ))}
              </select>
            </Field>
            <label>
              <input type="checkbox" name="landscape" /> {m.landscape}
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label={m.margin}>
                <Input
                  name="margin"
                  type="number"
                  min={12}
                  max={32}
                  defaultValue={12}
                />
              </Field>
              <Field label={m.horizontal}>
                <Input
                  name="overlapX"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={8}
                />
              </Field>
              <Field label={m.vertical}>
                <Input
                  name="overlapY"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={8}
                />
              </Field>
            </div>
            <div>
              <Button type="submit">
                {pending === m.generating ? pending : m.generate}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {!readonly && step === 5 && (
        <div>
          <Button
            disabled={blocked}
            onClick={() =>
              void operation(
                m.cleanup,
                () => mutateCatalog("files/cleanup"),
                m.cleaned,
              )
            }
          >
            {m.cleanup}
          </Button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="text-accent">
          {error}
        </p>
      )}
    </section>
  );
}
