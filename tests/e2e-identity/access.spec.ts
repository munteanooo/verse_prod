import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
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
});
