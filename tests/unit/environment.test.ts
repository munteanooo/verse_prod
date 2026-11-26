import { describe, expect, it } from "vitest";
import { parseEnvironment } from "@/config/environment";

describe("deployment origin", () => {
  it("permits development with no deployment configuration", () => {
    expect(parseEnvironment({}).siteUrl).toBeUndefined();
  });

  it.each([
    ["https://example.test/", "https://example.test"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://[::1]:3000", "http://[::1]:3000"],
  ])("normalizes %s to its origin", (input, expected) => {
    expect(parseEnvironment({ VERSE_SITE_URL: input }).siteUrl).toBe(expected);
  });

  it.each([
    "",
    "not-a-url",
    "http://example.test",
    "https://example.test/path",
    "https://example.test/./",
    "https://example.test/?",
    "https://example.test/#",
    "https://user:password@example.test",
  ])(
    "rejects invalid configuration %s without exposing the supplied value",
    (input) => {
      expect(() => parseEnvironment({ VERSE_SITE_URL: input })).toThrow(
        "VERSE_SITE_URL must be an HTTPS origin or a loopback HTTP origin.",
      );
    },
  );
});
