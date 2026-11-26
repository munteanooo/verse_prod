import { eq } from "drizzle-orm";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { project } from "../../config/project";
import { can, type Permission } from "../../modules/identity/policy";
import { readRole } from "../../modules/identity/roles";
import { recordAudit } from "../../modules/identity/audit";
import { privilegedSession } from "../database/schema";
import { getIdentity } from "./service";

export async function authorize(
  requestHeaders: Headers,
  permission?: Permission,
  ownerId?: string,
  service = getIdentity(),
) {
  if (!service) return;
  const { auth, db } = service;
  const active = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!active?.user.emailVerified) return;
  const role = await readRole(db, active.user.id);
  if (!role) return;

  if (permission) {
    const privileged = role !== "CUSTOMER";
    const [proof] =
      privileged && active.user.twoFactorEnabled
        ? await db
            .select({ verifiedAt: privilegedSession.verifiedAt })
            .from(privilegedSession)
            .where(eq(privilegedSession.sessionId, active.session.id))
        : [];
    const recentMfa =
      proof && Date.now() - proof.verifiedAt.getTime() < 12 * 60 * 60 * 1000;
    if (
      !can(
        role,
        permission,
        ownerId ? { ownerId, actorId: active.user.id } : undefined,
      ) ||
      (privileged && !recentMfa)
    ) {
      await recordAudit(db, {
        actorId: active.user.id,
        action: "authorization.denied",
        resourceType: "permission",
        resourceId: permission,
        metadata: { role },
      });
      return;
    }
  }

  return { user: active.user, role };
}

const current = cache(async (permission?: Permission) => {
  const requestHeaders = await headers();
  try {
    return await authorize(requestHeaders, permission);
  } catch {
    console.error("Identity authorization could not be evaluated.");
    return undefined;
  }
});

export async function requireAdmin() {
  const actor = await current("admin:access");
  if (!actor) notFound();
  return actor;
}

export async function requireAccount() {
  const actor = await current();
  if (!actor) redirect(project.routes.login);
  return actor;
}
