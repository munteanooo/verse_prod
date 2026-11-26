import type { ReactNode } from "react";
import { ActionLink } from "@/components/ui/button";
import { project } from "@/config/project";
import { messages } from "@/i18n";

export function StatusMessage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="wrap grid gap-5 py-20" aria-labelledby="status-title">
      <h1 id="status-title" className="font-serif text-5xl" tabIndex={-1}>
        {title}
      </h1>
      <p>{description}</p>
      <div className="flex flex-wrap gap-3">
        {children}
        <ActionLink href={project.routes.customer}>
          {messages.errors.home}
        </ActionLink>
      </div>
    </section>
  );
}
