import { demoImage, demoPdf } from "../../scripts/documents/fixtures.mjs";
import { documentMessages as d } from "../../src/i18n/documents-ro";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { catalogMessages as c } from "../../src/i18n/catalog-ro";
import { identityMessages as m } from "../../src/i18n/identity-ro";
import { testDatabaseUrl } from "../support/database";
import { totp } from "../support/totp";

test("registers via SMTP, denies customer access and opens admin only after MFA", async ({
  page,
  request,
  baseURL,
}) => {
  const email = randomUUID() + "@verse.example.test";
  let password = "Synthetic-browser-password-2026!";
  const emailApi = `http://127.0.0.1:${process.env.TEST_MAILPIT_PORT ?? "8025"}`;
  const passwordInput = () => page.locator('input[name="password"]');

  expect((await page.goto("/admin"))?.status()).toBe(404);
  expect((await request.get("/api/v1/admin/users")).status()).toBe(404);
  const login = async () => {
    const result = await page.goto("/login");
    expect(result?.headers()["content-security-policy"]).toContain(
      "'strict-dynamic'",
    );
    await page.getByLabel(m.email).fill(email);
    await passwordInput().fill(password);
    await page.getByRole("button", { name: m.submit }).click();
  };

  await page.goto("/register");
  await page.getByLabel(m.name).fill("Synthetic browser account");
  await page.getByLabel(m.email).fill(email);
  await passwordInput().fill(password);
  await page.getByRole("button", { name: m.show }).click();
  await expect(passwordInput()).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: m.hide }).click();
  await page.getByRole("button", { name: m.submit }).click();
  await expect(page.getByRole("status")).toHaveText(m.checkEmail);

  async function emailLink(path: string) {
    let link: string | undefined;
    await expect
      .poll(async () => {
        const result = await request.get(emailApi + "/api/v1/search", {
          params: { query: "to:" + email },
        });
        if (!result.ok()) return false;
        const { messages } = (await result.json()) as {
          messages: { ID: string }[];
        };
        for (const { ID } of messages) {
          const message = await request.get(emailApi + "/api/v1/message/" + ID);
          const { Text } = (await message.json()) as { Text: string };
          link = Text.trim()
            .split(/\s+/)
            .findLast((part) => part.startsWith(baseURL + path + "#token="));
          if (link) return true;
        }
        return false;
      })
      .toBe(true);
    if (!link) throw new Error("Expected a local identity email.");
    return link;
  }
  await page.goto(await emailLink("/verify-email"));
  await page.getByRole("button", { name: m.confirm }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByRole("status")).toHaveText(m.verificationReturn);

  await login();
  await expect(page).toHaveURL(/\/account$/);
  expect((await page.goto("/admin"))?.status()).toBe(404);

  const denied = await page.request.post("/api/v1/admin/categories", {
    headers: { Origin: baseURL! },
    data: { value: { slug: "unauthorized" } },
  });
  expect(denied.status()).toBe(404);
  expect((await page.goto("/admin/patterns"))?.status()).toBe(404);

  await page.goto("/forgot-password");
  await page.getByLabel(m.email).fill(email);
  await page.getByRole("button", { name: m.submit }).click();
  await expect(page.getByRole("status")).toHaveText(m.checkEmail);
  await page.goto(await emailLink("/reset-password"));
  await expect(page).toHaveURL(/\/reset-password$/);
  password = "Synthetic-updated-browser-password-2026!";
  await page.getByLabel(m.newPassword).fill(password);
  await page.getByRole("button", { name: m.submit }).click();
  await expect(page.getByRole("status")).toHaveText(m.resetDone);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);

  execFileSync("pnpm", ["identity:role", email, "ADMIN"], {
    env: { ...process.env, DATABASE_MIGRATION_URL: testDatabaseUrl() },
    stdio: "pipe",
  });
  await login();
  await expect(page).toHaveURL(/\/account$/);
  expect((await page.goto("/admin"))?.status()).toBe(404);

  await page.goto("/account");
  await page.getByText(m.enableMfa).click();
  await passwordInput().fill(password);
  await page.getByRole("button", { name: m.submit }).click();
  const setupLink = page.getByRole("link", { name: m.setupLink });
  await expect(setupLink).toBeVisible();
  const uri = await setupLink.getAttribute("href");
  if (!uri) throw new Error("Expected authenticator enrollment URI.");
  await page.getByLabel(m.code).fill(totp(uri));
  await page.getByRole("button", { name: m.submit }).click();
  await expect(page.getByRole("status")).toHaveText(m.setupDone);
  await page.getByRole("button", { name: m.signOut }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login();
  await expect(page.getByLabel(m.code)).toBeVisible();
  expect((await request.get("/admin")).status()).toBe(404);
  await page.getByLabel(m.code).fill(totp(uri));
  await page.getByRole("button", { name: m.submit }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("link", { name: m.administrator, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: m.administrator }),
  ).toBeVisible();
  await expect(page.getByText(m.adminIntro)).toBeVisible();
  expect((await request.get("/api/v1/admin/users")).status()).toBe(404);
  await test.step("manages a category and a reusable measurement", async () => {
    const suffix = email.slice(0, 8);
    const categoryName = "Fuste " + suffix;
    const definitionName = "Talie " + suffix;
    const csrf = await page.request.post("/api/v1/admin/categories", {
      headers: { Origin: "https://untrusted.example.test" },
      data: {},
    });
    expect(csrf.status()).toBe(403);
    await page.getByRole("link", { name: c.categories, exact: true }).click();
    await page.getByRole("button", { name: c.categoryNew }).click();
    await page.getByLabel(c.name, { exact: true }).fill(categoryName);
    await page.getByLabel(new RegExp(c.slug)).fill("fuste-" + suffix);
    await page.getByRole("button", { name: c.save, exact: true }).click();
    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

    await page.getByRole("link", { name: c.measurements, exact: true }).click();
    await page.getByRole("button", { name: c.measurementNew }).click();
    await page.getByLabel(c.name, { exact: true }).fill(definitionName);
    await page.getByLabel(new RegExp(c.key)).fill("talie-" + suffix);
    await page.getByLabel(c.min, { exact: true }).fill("40");
    await page.getByLabel(c.max, { exact: true }).fill("130");
    await page.getByRole("button", { name: c.save, exact: true }).click();
    await expect(page.getByText(definitionName, { exact: true })).toBeVisible();
  });

  await test.step("saves, resumes, validates and previews a six-step draft", async () => {
    const suffix = email.slice(0, 8);
    const patternName = "Fustă petrecută " + suffix;
    const step = (index: number) =>
      page.getByRole("button", {
        name: String(index + 1) + ". " + c.steps[index],
        exact: true,
      });
    const save = () =>
      page.getByRole("button", { name: c.saveDraft, exact: true }).click();
    await page.getByRole("link", { name: c.patterns, exact: true }).click();
    await page.getByRole("link", { name: c.newPattern }).click();
    await page.getByRole("button", { name: c.newPattern }).click();
    await expect(page).toHaveURL(/\/admin\/patterns\/[a-f0-9-]+\/edit$/);
    await page.getByLabel(c.name, { exact: true }).fill(patternName);
    await page.getByLabel(new RegExp(c.slug)).fill("fusta-" + suffix);
    await page
      .getByRole("combobox", { name: c.category, exact: true })
      .selectOption({ label: "Fuste " + suffix });
    await save();
    await expect(page.getByRole("status")).toHaveText(c.saved);
    await page.getByRole("link", { name: c.back }).click();
    await page.getByRole("button", { name: c.search, exact: true }).waitFor();
    await page.getByRole("textbox", { name: c.search }).fill(patternName);
    await page.getByRole("button", { name: c.search, exact: true }).click();
    const result = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: patternName }) });
    await result.getByRole("link", { name: c.edit }).click();
    await expect(page.getByLabel(c.name, { exact: true })).toHaveValue(
      patternName,
    );
    await page.getByLabel(c.short, { exact: true }).fill("Schiță");
    await page
      .getByLabel(c.description, { exact: true })
      .fill("Fustă pentru test.");
    await page
      .getByRole("combobox", { name: c.difficulty })
      .selectOption("BEGINNER");
    await page.getByLabel(c.materials).fill("In");
    await page.getByLabel(c.instructions).fill("Coase tivul.");

    await step(1).click();
    await page.getByRole("button", { name: c.addPiece }).click();
    await page.getByLabel(c.name, { exact: true }).fill("Față");
    await page.getByLabel(c.quantity).fill("0");
    await save();
    await expect(
      page.getByRole("alert").filter({ hasText: c.errors.invalid }),
    ).toBeVisible();
    await page.getByLabel(c.quantity).fill("2");
    await page.getByLabel(c.seam).fill("12,5");

    await step(2).click();
    await page.getByRole("button", { name: c.refreshMeasurements }).click();
    await expect(page.getByRole("status")).toHaveText(c.refreshedMeasurements);
    await page
      .getByRole("combobox", { name: c.measurements, exact: true })
      .selectOption({ label: "Talie " + suffix + " (cm)" });
    await page
      .getByRole("button", { name: c.addMeasurement, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: c.measurementPreview }),
    ).toBeVisible();

    await step(3).click();
    await page.getByRole("button", { name: c.addSize }).click();
    await page.getByLabel(c.label).fill("Scurtă");
    await page.getByLabel("Talie " + suffix + " (cm)", { exact: true }).check();
    await page.getByLabel(c.min, { exact: true }).fill("64");
    await page.getByLabel(c.max, { exact: true }).fill("74");

    await step(4).click();
    await page
      .getByRole("combobox", { name: c.steps[4], exact: true })
      .selectOption("PREMIUM");
    await page.getByLabel(c.amount).fill("25,50");
    await step(5).click();
    await save();
    await expect(
      page.getByRole("status").filter({ hasText: c.saved }),
    ).toBeVisible();
    await page.getByRole("link", { name: c.preview, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: patternName }),
    ).toBeVisible();
    await expect(
      page.getByText("Scurtă", { exact: false }).last(),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: c.publish }).click();
    await expect(
      page.getByRole("status").filter({ hasText: c.publicationBlocked }),
    ).toBeVisible();
  });

  await test.step("uploads a cover and source, generates and downloads A4, then withdraws", async () => {
    const suffix = email.slice(0, 8);
    const slug = "fusta-" + suffix;
    const step = (index: number) =>
      page.getByRole("button", {
        name: String(index + 1) + ". " + c.steps[index],
        exact: true,
      });
    await page.getByRole("link", { name: c.edit, exact: true }).click();
    const patternPath = page.url().replace(/\/edit$/, "");
    await step(4).click();
    await page
      .getByRole("combobox", { name: c.steps[4], exact: true })
      .selectOption("FREE");
    await page.getByRole("button", { name: c.saveDraft }).click();
    await expect(page.getByText(c.saved, { exact: true })).toBeVisible();

    await step(0).click();
    await page.getByLabel(d.alt).fill("Copertă sintetică");
    await page.getByLabel(d.choose).setInputFiles({
      name: "atelier.png",
      mimeType: "image/png",
      buffer: await demoImage(),
    });
    await page.getByRole("button", { name: d.upload }).click();
    await expect(page.getByText(d.uploaded, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Copertă sintetică" }),
    ).toBeVisible();

    await step(3).click();
    const sourceSize = page.locator('select[name="sizeId"]');
    await sourceSize.selectOption({ label: "Scurtă" });
    const sizeId = await sourceSize.inputValue();
    await page.getByLabel(d.choose).setInputFiles({
      name: "control.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await demoPdf()),
    });
    await page.getByRole("button", { name: d.upload }).click();
    await expect(page.getByText(d.uploaded, { exact: true })).toBeVisible();
    await page.getByLabel(d.scaleHint).fill("Linia de control măsoară 100 mm");
    await page.getByRole("button", { name: d.confirmScale }).click();
    await expect(
      page.getByText(d.scaleDone, { exact: true }).first(),
    ).toBeVisible();
    await page
      .locator('select[name="processSize"]')
      .selectOption({ label: "Scurtă" });
    await page.getByRole("button", { name: d.generate }).click();
    await expect(page.getByText(d.generated, { exact: true })).toBeVisible();
    const preview = await page
      .getByRole("link", { name: d.preview })
      .getAttribute("href");
    if (!preview) throw new Error("Expected document preview");
    const previewResponse = await page.request.get(preview);
    expect(previewResponse.headers()["content-type"]).toBe("application/pdf");
    expect((await request.get(preview)).status()).toBe(404);

    await step(5).click();
    await page.getByRole("button", { name: c.publish }).click();
    await expect(page).toHaveURL(new RegExp(patternPath + "/preview$"));
    await page.goto("/patterns/" + slug);
    await expect(
      page.getByRole("img", { name: "Copertă sintetică" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByRole("img", { name: "Copertă sintetică" })
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    const measurement = page.getByRole("textbox", {
      name: new RegExp("Talie " + suffix),
    });
    await measurement.fill("70");
    const customer = await import("../../src/i18n/customer-ro");
    await page
      .getByRole("button", { name: customer.customerMessages.calculate })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: customer.customerMessages.single }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: customer.customerMessages.selectSize })
      .selectOption({ label: "Scurtă" });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: d.download }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    const guest = await request.post("/api/v1/patterns/" + slug + "/download", {
      headers: { Origin: baseURL! },
      data: { sizeId, edition: 1 },
    });
    expect(guest.status()).toBe(200);
    expect((await guest.body()).subarray(0, 5).toString()).toBe("%PDF-");

    await page.getByRole("button", { name: d.saveLibrary }).click();
    await expect(page.getByText(d.librarySaved, { exact: true })).toBeVisible();
    await page.goto("/account/library");
    await expect(
      page.getByRole("link", { name: "Fustă petrecută " + suffix }),
    ).toBeVisible();

    await page.goto(patternPath + "/preview");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: d.unpublish }).click();
    await expect(page.getByText(d.withdrawn, { exact: true })).toBeVisible();
    await page.goto("/account/library");
    await expect(page.getByText(d.libraryEmpty, { exact: true })).toBeVisible();
    expect((await request.get("/api/v1/patterns/" + slug)).status()).toBe(404);
    expect(
      (
        await request.post("/api/v1/patterns/" + slug + "/download", {
          headers: { Origin: baseURL! },
          data: { sizeId, edition: 1 },
        })
      ).status(),
    ).toBe(404);
  });
});
