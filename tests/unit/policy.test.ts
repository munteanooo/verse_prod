import { describe, expect, it } from "vitest";
import { can, safeRedirect } from "@/modules/identity/policy";
import { readIdentityEnvironment } from "@/config/identity-environment";

describe("identity policy", () => {
  it("denies anonymous permissions and reserves administration for admins", () => {
    expect(can(undefined, "pattern:read")).toBe(false);
    expect(can("CUSTOMER", "admin:access")).toBe(false);
    expect(can("DESIGNER", "pattern:publish")).toBe(false);
    expect(can("ADMIN", "admin:access")).toBe(true);
  });

  it("checks ownership when using the own-only permission", () => {
    expect(
      can("DESIGNER", "pattern:update:own", { ownerId: "a", actorId: "a" }),
    ).toBe(true);
    expect(
      can("DESIGNER", "pattern:update:own", { ownerId: "a", actorId: "b" }),
    ).toBe(false);
    expect(can("DESIGNER", "pattern:update:own")).toBe(false);
  });

  it.each([
    "//example.test",
    "https://example.test",
    "/\\example.test",
    "/%2fexample.test",
    "/a/..//example.test",
    "/\n/example.test",
  ])("falls back for %s", (value) => {
    expect(safeRedirect(value)).toBe("/account");
  });

  it("preserves a local path and its query string", () => {
    expect(safeRedirect("/reset-password?error=invalid")).toBe(
      "/reset-password?error=invalid",
    );
  });

  it("requires hosted database TLS and rejects a hosted loopback origin", () => {
    const settings = {
      DATABASE_URL: "postgresql://localhost/verse_prod",
      BETTER_AUTH_SECRET: "abcdefghijklmnopqrstuvwxyz-0123456789_ABCDEFG",
      VERSE_SITE_URL: "https://example.test",
    };
    expect(() => readIdentityEnvironment(settings)).toThrow(
      "sslmode=verify-full",
    );
    expect(() =>
      readIdentityEnvironment({
        ...settings,
        VERSE_SITE_URL: "http://localhost:3000",
        VERCEL: "1",
      }),
    ).toThrow("HTTPS origin");
  });
});
