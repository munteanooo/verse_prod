import { expect, test } from "@playwright/test";
import { project } from "../../src/config/project";

test("renders the Romanian landing page and opens its empty collection section", async ({
  page,
}) => {
  await page.goto(project.routes.customer);
  await expect(page.locator("html")).toHaveAttribute("lang", "ro");
  await expect(page).toHaveTitle(/VERSE/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "în garderobă.",
  );
  const image = page.getByRole("img", { name: /Cămașă din in natural/ });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);

  await page.getByRole("link", { name: "Catalog de tipare" }).first().click();
  await expect(page).toHaveURL(new RegExp(`#${project.sections.featured}$`));
  await expect(
    page.getByRole("heading", { name: "Colecția se pregătește" }),
  ).toBeInViewport();
  await page.goto("/patterns");
  await expect(page.getByRole("status")).toContainText(
    "Momentan nu există tipare publicate",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("reports liveness and denies access to administrative routes", async ({
  request,
  page,
}) => {
  const { admin, api } = project.routes;
  const health = await request.get(`${api}/health`);
  expect(health.status()).toBe(200);
  expect(health.headers()["cache-control"]).toBe("no-store");
  expect(health.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await health.json()).toEqual({ status: "ok" });

  for (const path of [admin, `${admin}/patterns`, `${api}${admin}/patterns`]) {
    const result = await request.get(path);
    expect(result.status()).toBe(404);
    expect(result.headers()["cache-control"]).toBe("no-store");
  }

  const missing = await page.goto("/pagina-inexistenta");
  expect(missing?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Pagina nu a fost găsită" }),
  ).toBeVisible();
});
