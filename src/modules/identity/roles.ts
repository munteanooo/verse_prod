import { eq } from "drizzle-orm";
import type { Database } from "../../infrastructure/database/connection";
import { session, user, userRole } from "../../infrastructure/database/schema";
import { recordAudit } from "./audit";
import type { Role } from "./policy";

export async function readRole(db: Pick<Database, "select">, userId: string) {
  const [assignment] = await db
    .select({ role: userRole.role })
    .from(userRole)
    .where(eq(userRole.userId, userId));
  return assignment?.role;
}

export async function assignRole(
  db: Database,
  email: string,
  role: Role,
  correlationId: string,
) {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: user.id, verified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email))
      .for("update");
    if (!target?.verified) throw new Error("A verified account is required.");
    const previous = await readRole(tx, target.id);
    if (previous === role) return false;

    await tx
      .insert(userRole)
      .values({ userId: target.id, role })
      .onConflictDoUpdate({
        target: userRole.userId,
        set: { role, updatedAt: new Date() },
      });
    const revoked = await tx
      .delete(session)
      .where(eq(session.userId, target.id))
      .returning({ id: session.id });
    await recordAudit(tx, {
      action: role === "ADMIN" ? "administrator.provisioned" : "role.changed",
      resourceType: "user",
      resourceId: target.id,
      correlationId,
      metadata: { previousRole: previous ?? "NONE", role },
    });
    if (role === "ADMIN")
      await recordAudit(tx, {
        action: "role.changed",
        resourceType: "user",
        resourceId: target.id,
        correlationId,
        metadata: { previousRole: previous ?? "NONE", role },
      });
    if (revoked.length && (previous !== "CUSTOMER" || role !== "CUSTOMER"))
      await recordAudit(tx, {
        action: "privileged.sessions.revoked",
        resourceType: "user",
        resourceId: target.id,
        correlationId,
        metadata: { count: revoked.length, reason: "role-change" },
      });
    return true;
  });
}
