"use client";

import type { ComponentProps, ReactNode } from "react";
import { project } from "@/config/project";
import { catalogMessages as m } from "@/i18n/catalog-ro";

import { inputClass } from "./classes";
export { inputClass, panelClass } from "./classes";

export function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: ReactNode;
  help?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
      {help && (
        <span className="mt-1 block font-normal text-muted-foreground">
          {help}
        </span>
      )}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={inputClass} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={4} {...props} className={inputClass} />;
}

export async function mutateCatalog(
  path: string,
  payload: object = {},
  method = "POST",
) {
  const response = await fetch(
    project.routes.api + project.routes.admin + "/" + path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await response.json();
  return { ok: response.ok, data };
}

export function messageFor(code: unknown) {
  return typeof code === "string" && Object.hasOwn(m.errors, code)
    ? m.errors[code as keyof typeof m.errors]
    : m.errors.unavailable;
}
