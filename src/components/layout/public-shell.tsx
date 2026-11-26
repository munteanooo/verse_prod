import type { ReactNode } from "react";
import { project } from "@/config/project";
import { messages } from "@/i18n";
import { identityMessages } from "@/i18n/identity-ro";

const navigation = [
  { href: project.routes.patterns, label: messages.navigation.featured },
  { href: project.routes.categories, label: messages.navigation.categories },
  {
    href: project.routes.customer + "#" + project.sections.process,
    label: messages.navigation.process,
  },
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
              {navigation.map(({ href, label }) => (
                <li key={href}>
                  <a href={href}>{label}</a>
                </li>
              ))}
              <li>
                <a href={project.routes.login}>{identityMessages.login}</a>
              </li>
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
