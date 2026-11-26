import type { ReactNode } from "react";
import { project } from "@/config/project";
import { messages } from "@/i18n";

export function AdminShell({
  title,
  navigation,
  children,
}: {
  title: string;
  navigation: readonly { href: string; label: string; current?: boolean }[];
  children: ReactNode;
}) {
  return (
    <>
      <a className="skip-link" href="#content">
        {messages.navigation.skip}
      </a>
      <div className="mx-auto grid max-w-7xl gap-8 p-6 md:grid-cols-[15rem_1fr]">
        <aside className="border-b border-border pb-4 md:border-r md:border-b-0">
          <a className="wordmark" href={project.routes.admin}>
            {project.brand}
          </a>
          <nav aria-label={messages.admin.label} className="mt-5">
            <ul>
              {navigation.map(({ href, label, current }) => (
                <li key={href}>
                  <a
                    className="inline-flex min-h-11 items-center pr-4 hover:underline aria-[current=page]:font-semibold"
                    href={href}
                    aria-current={current ? "page" : undefined}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <main id="content" tabIndex={-1}>
          <h1 className="font-serif text-4xl">{title}</h1>
          {children}
        </main>
      </div>
    </>
  );
}
