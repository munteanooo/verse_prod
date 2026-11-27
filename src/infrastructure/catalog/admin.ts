import { notFound } from "next/navigation";
import { requireAdmin } from "../auth/access";
import { getIdentity } from "../auth/service";
import { CatalogError, readPattern } from "../../modules/catalog/service";
import { id } from "../../modules/catalog/validation";

export async function adminCatalog() {
  const actor = await requireAdmin();
  const identity = getIdentity();
  if (!identity) notFound();
  return { db: identity.db, actor: { id: actor.user.id, role: actor.role } };
}

export async function adminPattern(patternId: string, version?: number) {
  const { db, actor } = await adminCatalog();
  if (!id.safeParse(patternId).success) notFound();
  try {
    return { db, actor, ...(await readPattern(db, actor, patternId, version)) };
  } catch (error) {
    if (
      error instanceof CatalogError &&
      ["missing", "forbidden"].includes(error.code)
    )
      notFound();
    throw error;
  }
}
