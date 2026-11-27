import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { measurementProfiles } from "../../src/infrastructure/database/profile-schema";
import { user } from "../../src/infrastructure/database/schema";
import { catalogMessages as c } from "../../src/i18n/catalog-ro";
import { customerMessages as m } from "../../src/i18n/customer-ro";
import { identityMessages as auth } from "../../src/i18n/identity-ro";
import { catalogFixture, fixtureDatabase } from "../support/customer-fixtures";

test("shows published customer content, fits standard sizes and reuses only the owner's profile", async ({
  browser,
  page,
  baseURL,
}) => {
  const { db, close } = fixtureDatabase();
  try {
    const fixture = await catalogFixture(db);
    const pattern = await fixture.add("customer");
    const draft = await fixture.add("hidden", "draft");
    const name = "Măsurătoare " + fixture.key;
    const detail = "/patterns/" + pattern.slug;
    const premium = await page.request.post(
      "/api/v1/patterns/" + pattern.slug + "/download",
      {
        headers: { Origin: baseURL! },
        data: { sizeId: randomUUID(), edition: 1 },
      },
    );
    expect(premium.status()).toBe(403);

    const guestProfileCount = await db.$count(measurementProfiles);
    const sitemap = await page.request.get("/sitemap.xml");
    expect(sitemap.ok()).toBe(true);
    const xml = await sitemap.text();
    expect(xml).toContain(baseURL + detail);
    expect(xml).not.toContain(draft.slug);
    expect(xml).not.toContain("/account/measurements");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/patterns?category=" + fixture.key);
    await expect(
      page.getByRole("link", { name: "Tipar " + pattern.slug }),
    ).toBeVisible();
    await expect(page.getByText("Tipar " + draft.slug)).toHaveCount(0);
    await page.getByRole("link", { name: "Tipar " + pattern.slug }).click();
    await expect(page).toHaveURL(new RegExp(detail + "$"));
    const measurement = page.getByRole("textbox", { name: new RegExp(name) });
    await expect(measurement).toBeVisible();
    await page.getByRole("button", { name: m.calculate }).click();
    await expect(page.getByRole("status")).toContainText(m.insufficient);
    await measurement.fill("79.55");
    await page.getByRole("button", { name: m.calculate }).click();
    await expect(page.getByRole("status")).toContainText(m.invalid);
    await measurement.fill("80");
    await page.getByRole("button", { name: m.calculate }).click();
    await expect(page.getByRole("status")).toContainText(m.multiple);
    await expect(page.getByRole("status")).toContainText("Atelier B");
    expect(page.url()).not.toContain("?");
    expect(await db.$count(measurementProfiles)).toBe(guestProfileCount);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    expect(
      (await page.request.get("/api/v1/patterns/" + draft.slug)).status(),
    ).toBe(404);
    expect(
      (await page.request.get("/api/v1/account/measurement-profiles")).status(),
    ).toBe(404);

    const password = "Synthetic-customer-password-2026!";
    const email = randomUUID() + "@verse.example.test";
    await page.goto("/register");
    await page.getByLabel(auth.name).fill("Synthetic customer");
    await page.getByLabel(auth.email).fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: auth.submit }).click();
    await expect(page.getByRole("status")).toHaveText(auth.checkEmail);
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, email));
    await page.goto("/login");
    await page.getByLabel(auth.email).fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: auth.submit }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/account/measurements/new");
    await page.getByLabel(m.profileName).fill("Personal test");
    await page
      .getByRole("combobox", { name: c.measurements })
      .selectOption({ label: name + " (cm)" });
    await page.getByRole("button", { name: m.addMeasurement }).click();
    await page.getByRole("textbox", { name: new RegExp(name) }).fill("75");
    await page.getByRole("button", { name: c.save, exact: true }).click();
    await expect(page).toHaveURL(/\/account\/measurements\/[a-f0-9-]+$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    const id = page.url().split("/").at(-1);
    const api = "/api/v1/account/measurement-profiles/" + id;
    const response = await page.request.get(api);
    expect(response.headers()["cache-control"]).toContain("no-store");

    await page.goto(detail);
    await page
      .getByRole("combobox", { name: m.chooseProfile })
      .selectOption({ label: "Personal test" });
    await page.getByRole("button", { name: m.loadProfile }).click();
    await expect(measurement).toHaveValue("75");
    await page.getByRole("button", { name: m.calculate }).click();
    await expect(page.getByRole("status")).toContainText(m.single);

    const context = await browser.newContext({ baseURL });
    try {
      const other = randomUUID() + "@verse.example.test";
      const post = (path: string, data: object) =>
        context.request.post("/api/auth/" + path, {
          headers: { Origin: baseURL! },
          data,
        });
      expect(
        (
          await post("sign-up/email", {
            email: other,
            name: "Other test customer",
            password,
          })
        ).status(),
      ).toBe(200);
      await db
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.email, other));
      expect(
        (await post("sign-in/email", { email: other, password })).status(),
      ).toBe(200);
      expect((await context.request.get(api)).status()).toBe(404);
      expect(
        (
          await context.request.delete(api, { headers: { Origin: baseURL! } })
        ).status(),
      ).toBe(404);
    } finally {
      await context.close();
    }
  } finally {
    await close();
  }
});
