import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AdminShell } from "@/components/layout/admin-shell";

it("renders an administrator navigation landmark and marks the current page", () => {
  const markup = renderToStaticMarkup(
    <AdminShell
      title="Tipare"
      navigation={[{ href: "/admin/patterns", label: "Tipare", current: true }]}
    >
      <p>Exemplu</p>
    </AdminShell>,
  );

  expect(markup).toContain('aria-label="Administrare"');
  expect(markup).toContain('aria-current="page"');
  expect(markup).toContain("<p>Exemplu</p>");
});
