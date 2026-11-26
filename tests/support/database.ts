import { isLoopback } from "../../src/config/identity-environment";

export function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      "Set TEST_DATABASE_URL to an isolated loopback PostgreSQL database ending in _test.",
    );
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !isLoopback(url.hostname) ||
    !/^\/[a-z0-9_]+_test$/i.test(url.pathname) ||
    url.searchParams.has("host") ||
    url.searchParams.has("port")
  ) {
    throw new Error(
      "Integration tests require an isolated loopback PostgreSQL database ending in _test.",
    );
  }
  return value;
}
