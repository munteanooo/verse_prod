import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import type { Database } from "../database/connection";
import { authThrottle } from "../database/schema";

export async function consumeAuthLimit(
  db: Database,
  key: string,
  max: number,
  windowMs: number,
) {
  const now = Date.now();
  const [row] = await db
    .insert(authThrottle)
    .values({ key, count: 1, expiresAt: now + windowMs })
    .onConflictDoUpdate({
      target: authThrottle.key,
      set: {
        count: sql`case when ${authThrottle.expiresAt} <= ${now} then 1 else least(${authThrottle.count} + 1, ${max + 1}) end`,
        expiresAt: sql`case when ${authThrottle.expiresAt} <= ${now} then ${now + windowMs} else ${authThrottle.expiresAt} end`,
      },
    })
    .returning({ count: authThrottle.count });
  return row.count <= max;
}

export function rateKey(secret: string, scope: string, identifier: string) {
  return createHmac("sha256", secret)
    .update(JSON.stringify([scope, identifier]))
    .digest("hex");
}

export function requestRateIdentifier(headers: Headers) {
  const candidate = process.env.VERCEL
    ? headers.get("x-vercel-forwarded-for")?.trim()
    : undefined;
  return candidate && isIP(candidate) ? candidate : "shared";
}
