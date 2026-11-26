import { randomUUID } from "node:crypto";
import type { Database } from "../../infrastructure/database/connection";
import { auditLog } from "../../infrastructure/database/schema";

export type AuditEvent = Omit<
  typeof auditLog.$inferInsert,
  "id" | "occurredAt" | "correlationId"
> & { correlationId?: string };
type AuditWriter = Pick<Database, "insert">;

export async function recordAudit(db: AuditWriter, event: AuditEvent) {
  await db
    .insert(auditLog)
    .values({ ...event, correlationId: event.correlationId ?? randomUUID() });
}
