import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL: origin, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm start --hostname 127.0.0.1 --port ${port}`,
    url: origin,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
