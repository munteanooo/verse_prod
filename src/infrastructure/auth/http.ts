import { readJson } from "../../shared/http-json";
import { randomUUID } from "node:crypto";
import { toNextJsHandler } from "better-auth/next-js";
import { z } from "zod";
import { recordAudit } from "../../modules/identity/audit";
import { readRole } from "../../modules/identity/roles";
import {
  credentials,
  email,
  password,
  registration,
} from "../../modules/identity/validation";
import { project } from "../../config/project";
import { getIdentity } from "./service";
import { consumeAuthLimit, rateKey, requestRateIdentifier } from "./throttle";

const routes = project.routes;
const emailBody = z.object({ email });
const empty = z.object({});
const secretToken = z.string().min(1).max(512);
const post = {
  "/sign-up/email": registration,
  "/sign-in/email": credentials,
  "/sign-out": empty,
  "/revoke-sessions": empty,
  "/request-password-reset": emailBody,
  "/send-verification-email": emailBody,
  "/verify-email": z.object({ token: z.string().min(1).max(2048) }),
  "/reset-password": z.object({ token: secretToken, newPassword: password }),
  "/two-factor/enable": z.object({ password: credentials.shape.password }),
  "/two-factor/verify-backup-code": z.object({
    code: z.string().trim().min(8).max(32),
  }),
  "/two-factor/verify-totp": z.object({ code: z.string().regex(/^\d{6}$/) }),
} as const;

const emailPaths = new Set([
  "/sign-up/email",
  "/request-password-reset",
  "/send-verification-email",
]);

const responseHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function reply(
  status: number,
  correlationId: string,
  data: object = { ok: false },
) {
  return Response.json(data, {
    status,
    headers: { ...responseHeaders, "X-Request-ID": correlationId },
  });
}

export async function identityRequest(
  request: Request,
  getService = getIdentity,
) {
  const correlationId = randomUUID();
  const url = new URL(request.url);
  const path = url.pathname.slice(routes.authApi.length);
  const action =
    request.method === "POST" && Object.hasOwn(post, path)
      ? (path as keyof typeof post)
      : undefined;
  if (!action) return reply(404, correlationId);

  try {
    const identity = getService();
    if (!identity) return reply(503, correlationId);
    const { auth, db, config, emailConfigured } = identity;
    if (request.headers.get("origin") !== config.origin)
      return reply(403, correlationId);
    if (emailPaths.has(path) && !emailConfigured)
      return reply(503, correlationId);

    const scope = action;
    if (
      !(await consumeAuthLimit(
        db,
        rateKey(config.secret, scope, requestRateIdentifier(request.headers)),
        30,
        60_000,
      ))
    ) {
      return reply(429, correlationId);
    }

    // Rebuild the URL and body with only the known callback destinations and fields.
    const target = new URL(routes.authApi + path, config.origin);
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    headers.set("x-verse-correlation-id", correlationId);
    const adapter = toNextJsHandler(auth);

    const body = post[action].safeParse(await readJson(request, 8192));
    if (!body.success) return reply(400, correlationId);
    if (
      "email" in body.data &&
      !(await consumeAuthLimit(
        db,
        rateKey(config.secret, scope + ":email", body.data.email),
        6,
        60_000,
      ))
    ) {
      return reply(429, correlationId);
    }

    if (action === "/verify-email" && "token" in body.data) {
      const result = await auth.api.verifyEmail({
        query: { token: body.data.token },
        headers,
        asResponse: true,
      });
      return result.ok
        ? reply(200, correlationId, { ok: true })
        : reply(result.status >= 500 ? 503 : 400, correlationId);
    }

    if (action === "/two-factor/enable") {
      const actor = await auth.api.getSession({ headers });
      if (!actor?.user.emailVerified || actor.user.twoFactorEnabled)
        return reply(400, correlationId);
    }
    const revoking = action === "/sign-out" || action === "/revoke-sessions";
    const current = revoking ? await auth.api.getSession({ headers }) : null;
    const role = current ? await readRole(db, current.user.id) : undefined;
    const result = await adapter.POST(
      new Request(target, {
        method: "POST",
        headers,
        body: JSON.stringify(body.data),
      }),
    );

    if (emailPaths.has(action)) return reply(200, correlationId, { ok: true });
    if (!result.ok)
      return reply(result.status >= 500 ? 503 : 400, correlationId);

    if (current && role && role !== "CUSTOMER")
      await recordAudit(db, {
        actorId: current.user.id,
        action: "privileged.sessions.revoked",
        resourceType: "user",
        resourceId: current.user.id,
        correlationId,
        metadata: { reason: action.slice(1) },
      });
    const data: {
      twoFactorRedirect?: boolean;
      totpURI?: string;
      backupCodes?: string[];
    } =
      action === "/sign-in/email" || action === "/two-factor/enable"
        ? await result.json()
        : {};
    const output = reply(200, correlationId, {
      ok: true,
      ...(data.twoFactorRedirect === true ? { twoFactorRedirect: true } : {}),
      ...(action === "/two-factor/enable"
        ? { totpURI: data.totpURI, backupCodes: data.backupCodes }
        : {}),
    });
    for (const cookie of result.headers.getSetCookie())
      output.headers.append("Set-Cookie", cookie);
    return output;
  } catch {
    console.error("Identity request failed.", { correlationId });
    return reply(503, correlationId);
  }
}
