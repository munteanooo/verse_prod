import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "./tests/support/database";

const port = 3103;
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e-identity",
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL: origin, trace: "off", ...devices["Desktop Chrome"] },
  timeout: 45_000,
  webServer: {
    command: `pnpm start --hostname 127.0.0.1 --port ${port}`,
    url: origin,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: testDatabaseUrl(),
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_ROOT: mkdtempSync(join(tmpdir(), "verse-playwright-")),
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
      VERSE_SITE_URL: origin,
      VERSE_SMTP_URL: `smtp://127.0.0.1:${process.env.TEST_SMTP_PORT ?? "1025"}`,
      VERSE_EMAIL_FROM: "verse@example.test",
    },
  },
});
