import { z } from "zod";

const siteOrigin = z.url({ protocol: /^https?$/ }).refine((value) => {
  if (!/^https?:\/\/[^/?#\\\s]+\/?$/i.test(value) || !URL.canParse(value)) {
    return false;
  }

  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

  return (
    (url.protocol === "https:" || loopback) &&
    (url.pathname === "/" || url.pathname === "") &&
    !url.username &&
    !url.password &&
    !value.includes("?") &&
    !value.includes("#")
  );
});

const environmentSchema = z.object({
  VERSE_SITE_URL: siteOrigin.optional(),
});

export function parseEnvironment(environment: { VERSE_SITE_URL?: string }) {
  const parsed = environmentSchema.safeParse(environment);

  if (!parsed.success) {
    throw new Error(
      "VERSE_SITE_URL must be an HTTPS origin or a loopback HTTP origin.",
    );
  }

  const origin = parsed.data.VERSE_SITE_URL;
  return { siteUrl: origin === undefined ? undefined : new URL(origin).origin };
}
