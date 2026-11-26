import type { ReactNode } from "react";
import { project } from "@/config/project";
import { messages } from "@/i18n";

const navigation = [
  { id: project.sections.featured, label: messages.navigation.featured },
  { id: project.sections.categories, label: messages.navigation.categories },
  { id: project.sections.process, label: messages.navigation.process },
];

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#content">
        {messages.navigation.skip}
      </a>
      <header className="site-header" id="top">
        <div className="wrap header-inner">
          <a className="wordmark" href={project.routes.customer}>
            {project.brand}
          </a>
          <nav aria-label={messages.navigation.label}>
            <ul className="navigation">
              {navigation.map(({ id, label }) => (
                <li key={id}>
                  <a href={`${project.routes.customer}#${id}`}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main id="content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="wrap footer-inner">
          <div>
            <a className="wordmark" href={project.routes.customer}>
              {project.brand}
            </a>
            <p>{messages.footer.description}</p>
          </div>
          <a className="text-link" href="#top">
            {messages.footer.backToTop}
          </a>
        </div>
      </footer>
    </>
  );
}
