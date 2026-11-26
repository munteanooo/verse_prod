import { z } from "zod";
import { parseEnvironment } from "./environment";

export function isLoopback(host: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(host);
}

const dbUrl = z.url({ protocol: /^postgres(?:ql)?$/ }).refine((value) => {
  const url = URL.parse(value);
  return Boolean(
    url?.hostname &&
    !url.hostname.includes(",") &&
    /^\/[^/]+$/.test(url.pathname) &&
    !url.hash,
  );
});

function verifiesDatabaseTls(url: URL) {
  const modes = url.searchParams.getAll("sslmode");
  return modes.length === 1 && modes[0] === "verify-full";
}
const runtimeSchema = z.object({
  DATABASE_URL: dbUrl,
  BETTER_AUTH_SECRET: z
    .string()
    .min(43)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/)
    .refine((secret) => new Set(secret).size >= 16),
  VERSE_SITE_URL: z.string(),
  VERSE_SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
  VERSE_EMAIL_FROM: z.email().optional(),
});

export function readIdentityEnvironment(
  env: Record<string, string | undefined> = process.env,
) {
  if (!env.DATABASE_URL && !env.BETTER_AUTH_SECRET) return undefined;
  const parsed = runtimeSchema.safeParse(env);
  if (!parsed.success)
    throw new Error("Invalid identity environment configuration.");
  const config = parsed.data;
  const origin = parseEnvironment(config).siteUrl;
  if (!origin) throw new Error("Identity requires a canonical site origin.");
  const local = isLoopback(new URL(origin).hostname);
  if (env.VERCEL && local)
    throw new Error("Hosted authentication requires an HTTPS origin.");
  const database = new URL(config.DATABASE_URL);
  if (!local || !isLoopback(database.hostname)) {
    if (!verifiesDatabaseTls(database))
      throw new Error("Hosted Postgres requires sslmode=verify-full.");
  }
  const smtp = config.VERSE_SMTP_URL
    ? new URL(config.VERSE_SMTP_URL)
    : undefined;
  if (
    smtp &&
    (smtp.search ||
      smtp.hash ||
      !config.VERSE_EMAIL_FROM ||
      (smtp.protocol !== "smtps:" && !(local && isLoopback(smtp.hostname))))
  ) {
    throw new Error(
      "Email requires a sender and encrypted SMTP or a loopback SMTP test server.",
    );
  }
  return {
    origin,
    databaseUrl: config.DATABASE_URL,
    secret: config.BETTER_AUTH_SECRET,
    smtp: config.VERSE_SMTP_URL,
    emailFrom: config.VERSE_EMAIL_FROM,
  };
}

export function readMigrationUrl(
  env: Record<string, string | undefined> = process.env,
) {
  const parsed = dbUrl.safeParse(env.DATABASE_MIGRATION_URL);
  if (!parsed.success)
    throw new Error("Set DATABASE_MIGRATION_URL for this operator command.");
  const url = new URL(parsed.data);
  if (!isLoopback(url.hostname) && !verifiesDatabaseTls(url))
    throw new Error("Remote operator connections require sslmode=verify-full.");
  return parsed.data;
}
