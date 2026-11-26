import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authorize } from "../auth/access";
import { getIdentity } from "../auth/service";
import { readJson } from "../../shared/http-json";
import {
  CatalogError,
  createPattern,
  listCategories,
  listDefinitions,
  listPatterns,
  patternAction,
  patternFilters,
  readPattern,
  saveDraft,
  saveLibrary,
} from "../../modules/catalog/service";
import { id } from "../../modules/catalog/validation";

const actions = z.object({
  action: z.enum(["archive", "publish", "new-version"]),
});

export async function catalogRequest(request: Request, path: string[]) {
  const requestId = randomUUID();
  const reply = (data: object, status = 200) =>
    Response.json(data, {
      status,
      headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
    });
  try {
    const identity = getIdentity();
    const member =
      identity &&
      (await authorize(request.headers, "admin:access", undefined, identity));
    if (!identity || !member) return reply({ code: "missing" }, 404);
    const { db, config } = identity;
    const actor = { id: member.user.id, role: member.role };
    const [resource, item, operation, ...rest] = path;
    const writing = request.method !== "GET";
    if (writing && request.headers.get("origin") !== config.origin)
      return reply({ code: "forbidden" }, 403);
    if (rest.length || (operation && !item))
      return reply({ code: "missing" }, 404);
    const query = new URL(request.url).searchParams;
    if ((resource === "categories" || resource === "measurements") && !item) {
      if (request.method === "GET") {
        const q = z
          .string()
          .max(100)
          .parse(query.get("q") ?? "");
        return reply({
          rows:
            resource === "categories"
              ? await listCategories(db, q)
              : await listDefinitions(db, q),
        });
      }
      if (request.method === "POST")
        return reply(
          await saveLibrary(
            db,
            actor,
            resource,
            await readJson(request, 32_768),
          ),
        );
    }
    if (resource !== "patterns") return reply({ code: "missing" }, 404);
    if (!item) {
      if (request.method === "GET")
        return reply(
          await listPatterns(
            db,
            actor,
            patternFilters.parse(Object.fromEntries(query)),
          ),
        );
      if (request.method === "POST")
        return reply(await createPattern(db, actor), 201);
    }
    if (item && id.safeParse(item).success) {
      if (!operation) {
        if (request.method === "GET")
          return reply(await readPattern(db, actor, item));
        if (request.method === "PUT") {
          const saved = await saveDraft(
            db,
            actor,
            item,
            await readJson(request, 786_432),
          );
          return reply({ revision: saved.revision });
        }
      }
      if (operation === "versions" && request.method === "POST") {
        const { action } = actions.parse(await readJson(request, 4096));
        const result = await patternAction(db, actor, item, action);
        return reply(result, "rejected" in result ? 422 : 200);
      }
    }
    return reply({ code: "missing" }, 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return reply(
        {
          code: "invalid",
          issues: error.issues.map((issue) => issue.path.join(".")),
        },
        400,
      );
    if (error instanceof CatalogError) {
      return reply(
        { code: error.code, issues: error.issues },
        {
          invalid: 400,
          forbidden: 403,
          missing: 404,
          conflict: 409,
          duplicate: 409,
        }[error.code],
      );
    }
    if ((error as { cause?: { code?: string } }).cause?.code === "23505")
      return reply({ code: "duplicate" }, 409);
    console.error("Catalog request failed.", { requestId });
    return reply({ code: "unavailable" }, 503);
  }
}
