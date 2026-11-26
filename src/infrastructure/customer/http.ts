import { z } from "zod";
import { readJson } from "../../shared/http-json";
import { authorize } from "../auth/access";
import { getIdentity } from "../auth/service";
import {
  consumeAuthLimit,
  rateKey,
  requestRateIdentifier,
} from "../auth/throttle";
import { id, slug } from "../../modules/catalog/validation";
import {
  catalogFilters,
  publicCategories,
  publishedPattern,
  publishedPatterns,
} from "../../modules/customer/public-catalog";
import {
  deleteProfile,
  listProfiles,
  ProfileError,
  readProfile,
  saveProfile,
} from "../../modules/customer/profiles";
import { recommendSize } from "../../modules/customer/measurements";

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function publicCatalogRequest(
  request: Request,
  resource: "categories" | "patterns",
  path: string[] = [],
) {
  const [key, action, ...rest] = path;
  if (rest.length || (key && !slug.safeParse(key).success))
    return json({ code: "missing" }, 404);
  try {
    const identity = getIdentity();
    if (
      request.method === "POST" &&
      resource === "patterns" &&
      key &&
      action === "recommend-size"
    ) {
      if (!identity) return json({ code: "missing" }, 404);
      const { config, db } = identity;
      if (request.headers.get("origin") !== config.origin)
        return json({ code: "forbidden" }, 403);
      if (
        !(await consumeAuthLimit(
          db,
          rateKey(
            config.secret,
            "public-size",
            requestRateIdentifier(request.headers),
          ),
          60,
          60000,
        ))
      )
        return json({ code: "limit" }, 429);
      const pattern = await publishedPattern(db, key);
      if (!pattern) return json({ code: "missing" }, 404);
      const payload = z
        .object({ values: z.unknown() })
        .safeParse(await readJson(request, 24000));
      if (!payload.success) return json({ code: "invalid" }, 400);
      return json(
        recommendSize(pattern.fields, pattern.sizes, payload.data.values),
      );
    }
    if (action || request.method !== "GET")
      return json({ code: "missing" }, 404);
    const filters = catalogFilters.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!identity)
      return key
        ? json({ code: "missing" }, 404)
        : json({ rows: [], next: false });
    if (resource === "patterns") {
      if (!key) return json(await publishedPatterns(identity.db, filters));
      const result = await publishedPattern(identity.db, key);
      return result ? json(result) : json({ code: "missing" }, 404);
    }
    const rows = await publicCategories(identity.db, key);
    if (!key) return json({ rows });
    return rows.length
      ? json({
          category: rows[0],
          ...(await publishedPatterns(identity.db, {
            ...filters,
            category: key,
          })),
        })
      : json({ code: "missing" }, 404);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ code: "invalid" }, 400);
    console.error("Public catalog request failed.");
    return json({ code: "unavailable" }, 503);
  }
}

export async function profilesRequest(request: Request, profileId?: string) {
  try {
    const identity = getIdentity();
    const actor =
      identity &&
      (await authorize(request.headers, undefined, undefined, identity));
    if (!identity || !actor) return json({ code: "missing" }, 404);
    const { db, config } = identity;
    const owner = actor.user.id;
    if (profileId && !id.safeParse(profileId).success)
      return json({ code: "missing" }, 404);
    if (request.method === "GET") {
      if (!profileId) return json({ rows: await listProfiles(db, owner) });
      const profile = await readProfile(db, owner, profileId);
      return profile ? json(profile) : json({ code: "missing" }, 404);
    }
    if (request.headers.get("origin") !== config.origin)
      return json({ code: "forbidden" }, 403);
    if (
      !(await consumeAuthLimit(
        db,
        rateKey(config.secret, "measurement-profile-write", owner),
        40,
        60000,
      ))
    )
      return json({ code: "limit" }, 429);
    if (request.method === "DELETE" && profileId) {
      await deleteProfile(db, owner, profileId);
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (
      (request.method === "POST" && !profileId) ||
      (request.method === "PATCH" && profileId)
    )
      return json(
        await saveProfile(db, owner, await readJson(request, 24000), profileId),
        profileId ? 200 : 201,
      );
    return json({ code: "missing" }, 404);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ code: "invalid" }, 400);
    if (error instanceof ProfileError)
      return json(
        { code: error.code },
        { missing: 404, invalid: 400, conflict: 409, limit: 409 }[error.code],
      );
    console.error("Measurement profile request failed.");
    return json({ code: "unavailable" }, 503);
  }
}
