import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authorize } from "@/infrastructure/auth/access";
import type { IdentityEmail } from "@/infrastructure/auth/email";
import { identityRequest } from "@/infrastructure/auth/http";
import { createIdentity } from "@/infrastructure/auth/service";
import { consumeAuthLimit } from "@/infrastructure/auth/throttle";
import { openDatabase } from "@/infrastructure/database/connection";
import {
  account,
  auditLog,
  session,
  user,
} from "@/infrastructure/database/schema";
import { assignRole, readRole } from "@/modules/identity/roles";
import { testDatabaseUrl } from "../support/database";
import { totp } from "../support/totp";

const databaseUrl = testDatabaseUrl();
const { db, close } = openDatabase(databaseUrl);
const password = "Synthetic-password-2026!";
const changedPassword = "Synthetic-changed-password-2026!";
const origin = "https://verse.example.test";

function fixture(
  expiry?: { verification: number; reset: number },
  mail = true,
) {
  const inbox: IdentityEmail[] = [];
  const config = {
    origin,
    databaseUrl,
    secret: randomBytes(32).toString("base64url"),
    smtp: undefined,
    emailFrom: undefined,
  };
  const service = createIdentity(
    db,
    config,
    mail
      ? async (message) => {
          inbox.push(message);
        }
      : undefined,
    expiry,
  );
  const email = randomUUID() + "@verse.example.test";
  const cookie = new Map<string, string>();
  const sessionHeaders = () =>
    new Headers({
      Cookie: [...cookie].map(([name, value]) => name + "=" + value).join("; "),
    });
  const run = async (path: string, body?: object, requestOrigin = origin) => {
    const headers = sessionHeaders();
    if (body) {
      headers.set("Content-Type", "application/json");
      headers.set("Origin", requestOrigin);
    }
    const response = await identityRequest(
      new Request(new URL("/api/auth" + path, origin), {
        headers,
        method: body ? "POST" : "GET",
        body: body ? JSON.stringify(body) : undefined,
      }),
      () => service,
    );
    for (const setCookie of response.headers.getSetCookie()) {
      const [nameValue] = setCookie.split(";");
      const pivot = nameValue.indexOf("=");
      cookie.set(nameValue.slice(0, pivot), nameValue.slice(pivot + 1));
    }
    return response;
  };
  const signup = () =>
    run("/sign-up/email", {
      email,
      name: "Synthetic Customer",
      password,
      role: "ADMIN",
      callbackURL: "https://evil.test",
    });
  const signIn = (value = password) =>
    run("/sign-in/email", { email, password: value });
  const link = (kind: IdentityEmail["kind"]) => {
    const message = inbox.findLast((item) => item.kind === kind);
    if (!message) throw new Error("Expected a local verification email");
    const url = new URL(message.url);
    expect(url.origin).toBe(origin);
    expect(url.search).toBe("");
    expect(url.pathname).toBe(
      kind === "verification" ? "/verify-email" : "/reset-password",
    );
    return url;
  };
  const token = (kind: IdentityEmail["kind"]) =>
    new URLSearchParams(link(kind).hash.slice(1)).get("token");
  const verify = () => run("/verify-email", { token: token("verification") });
  const findUser = async () => {
    const [record] = await db.select().from(user).where(eq(user.email, email));
    expect(record).toBeDefined();
    return record;
  };
  return {
    email,
    inbox,
    run,
    signup,
    signIn,
    link,
    token,
    verify,
    findUser,
    service,
    sessionHeaders,
  };
}

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
afterAll(() => close());

describe("identity against PostgreSQL", () => {
  it("registers one customer, hides duplicates, verifies email and supports logout", async () => {
    const f = fixture();
    const registered = await f.signup();
    expect(registered.status).toBe(200);
    expect(await registered.json()).toEqual({ ok: true });
    const duplicate = await f.signup();
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual({ ok: true });
    expect(f.inbox).toHaveLength(1);

    const current = await f.findUser();
    const [authAccount] = await db
      .select()
      .from(account)
      .where(eq(account.userId, current.id));
    expect(authAccount.password).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(await readRole(db, current.id)).toBe("CUSTOMER");
    expect((await f.signIn()).status).toBe(400);
    const verified = await f.verify();
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({ ok: true });
    expect((await f.signIn("wrong-password")).status).toBe(400);

    const response = await f.signIn();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const signedCookie = response.headers
      .getSetCookie()
      .find((value) => value.includes("session_token"));
    expect(signedCookie).toMatch(/^__Secure-/);
    expect(signedCookie).toMatch(/; HttpOnly/i);
    expect(signedCookie).toMatch(/; Secure/i);
    expect(signedCookie).toMatch(/; SameSite=Lax/i);
    expect(
      await authorize(f.sessionHeaders(), "admin:access", undefined, f.service),
    ).toBeUndefined();
    expect(
      await authorize(f.sessionHeaders(), undefined, undefined, f.service),
    ).toMatchObject({ role: "CUSTOMER" });

    const oldCookie = f.sessionHeaders();
    expect((await f.run("/sign-out", {})).status).toBe(200);
    expect(
      await authorize(oldCookie, undefined, undefined, f.service),
    ).toBeUndefined();
  });

  it("enforces session expiration and allows password reset to revoke existing sessions", async () => {
    const f = fixture();
    await f.signup();
    await f.verify();
    expect((await f.signIn()).status).toBe(200);
    const member = await f.findUser();
    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(session.userId, member.id));
    expect(
      await authorize(f.sessionHeaders(), undefined, undefined, f.service),
    ).toBeUndefined();
    expect((await f.signIn()).status).toBe(200);
    const previous = f.sessionHeaders();

    expect(
      (
        await f.run("/request-password-reset", {
          email: f.email,
          redirectTo: "https://evil.test",
        })
      ).status,
    ).toBe(200);
    const token = f.token("password-reset");
    expect(token).toBeTruthy();
    expect(
      (await f.run("/reset-password", { token, newPassword: changedPassword }))
        .status,
    ).toBe(200);
    expect(
      await authorize(previous, undefined, undefined, f.service),
    ).toBeUndefined();
    expect(
      (await f.run("/reset-password", { token, newPassword: password })).status,
    ).toBe(400);
    expect((await f.signIn()).status).toBe(400);
    expect((await f.signIn(changedPassword)).status).toBe(200);
  });

  it("rejects expired email verification and password reset tokens", async () => {
    const f = fixture({ verification: 1, reset: 1 });
    await f.signup();
    const verified = await f.verify();
    expect(verified.status).toBe(200);
    const other = fixture({ verification: 1, reset: 1 });
    await other.signup();
    await f.run("/request-password-reset", { email: f.email });
    const token = f.token("password-reset");
    await delay(2200);
    expect((await other.verify()).status).toBe(400);
    expect((await other.findUser()).emailVerified).toBe(false);
    expect(
      (await f.run("/reset-password", { token, newPassword: changedPassword }))
        .status,
    ).toBe(400);
  });

  it("requires verified provisioning and MFA proof bound to the current session", async () => {
    const f = fixture();
    await f.signup();
    await expect(
      assignRole(db, f.email, "ADMIN", randomUUID()),
    ).rejects.toThrow("verified account");
    await f.verify();
    await f.signIn();
    const initial = f.sessionHeaders();
    expect(await assignRole(db, f.email, "ADMIN", randomUUID())).toBe(true);
    expect(await assignRole(db, f.email, "ADMIN", randomUUID())).toBe(false);
    expect(
      await authorize(initial, undefined, undefined, f.service),
    ).toBeUndefined();
    await f.signIn();
    expect(
      await authorize(f.sessionHeaders(), "admin:access", undefined, f.service),
    ).toBeUndefined();
    const enrollment = await f.run("/two-factor/enable", { password });
    expect(enrollment.status).toBe(200);
    const { totpURI, backupCodes } = (await enrollment.json()) as {
      totpURI: string;
      backupCodes: string[];
    };
    expect(
      (await f.run("/two-factor/verify-totp", { code: totp(totpURI) })).status,
    ).toBe(200);
    await f.run("/sign-out", {});
    const challenge = await f.signIn();
    expect(await challenge.json()).toEqual({
      ok: true,
      twoFactorRedirect: true,
    });
    expect(
      await authorize(f.sessionHeaders(), "admin:access", undefined, f.service),
    ).toBeUndefined();
    expect(
      (
        await f.run("/two-factor/verify-totp", {
          code: totp(totpURI),
          trustDevice: true,
        })
      ).status,
    ).toBe(200);
    expect(
      await authorize(f.sessionHeaders(), "admin:access", undefined, f.service),
    ).toMatchObject({ role: "ADMIN" });
    await f.run("/sign-out", {});
    expect(await (await f.signIn()).json()).toEqual({
      ok: true,
      twoFactorRedirect: true,
    });
    expect(
      (await f.run("/two-factor/verify-backup-code", { code: backupCodes[0] }))
        .status,
    ).toBe(200);
    expect(
      await authorize(f.sessionHeaders(), "admin:access", undefined, f.service),
    ).toMatchObject({ role: "ADMIN" });
    const active = f.sessionHeaders();
    expect((await f.run("/revoke-sessions", {})).status).toBe(200);
    await f.signIn();
    expect(
      (await f.run("/two-factor/verify-backup-code", { code: backupCodes[0] }))
        .status,
    ).toBe(400);
    expect(
      await authorize(active, "admin:access", undefined, f.service),
    ).toBeUndefined();
    expect(await assignRole(db, f.email, "DESIGNER", randomUUID())).toBe(true);

    const member = await f.findUser();
    const denials = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, member.id));
    expect(denials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "authorization.denied",
          resourceId: "admin:access",
          correlationId: expect.any(String),
        }),
      ]),
    );
    const events = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, member.id));
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "administrator.provisioned",
        "role.changed",
        "privileged.authenticated",
        "privileged.sessions.revoked",
      ]),
    );
    expect(
      events.filter((event) => event.action === "administrator.provisioned"),
    ).toHaveLength(1);
  });

  it("fails closed for email workflows without a delivery adapter", async () => {
    const f = fixture(undefined, false);
    expect((await f.signup()).status).toBe(503);
    expect(
      (await f.run("/request-password-reset", { email: f.email })).status,
    ).toBe(503);
    expect(
      (await f.run("/send-verification-email", { email: f.email })).status,
    ).toBe(503);
    const rows = await db.select().from(user).where(eq(user.email, f.email));
    expect(rows).toHaveLength(0);
  });

  it("rejects cross-origin mutations and unknown privileged operations, and limits attempts atomically", async () => {
    const f = fixture();
    expect(
      (await f.run("/sign-up/email", { email: f.email }, "https://evil.test"))
        .status,
    ).toBe(403);
    expect(
      (
        await f.run(
          "/verify-email?token=synthetic&callbackURL=https://evil.test",
        )
      ).status,
    ).toBe(404);
    expect(
      (await f.run("/admin/set-role", { email: f.email, role: "ADMIN" }))
        .status,
    ).toBe(404);
    for (let attempt = 0; attempt < 6; attempt++) {
      expect((await f.signIn("invalid")).status).toBe(400);
    }
    expect((await f.signIn("invalid")).status).toBe(429);

    const key = randomUUID();
    const requests = await Promise.all(
      Array.from({ length: 12 }, () => consumeAuthLimit(db, key, 5, 60_000)),
    );
    expect(requests.filter(Boolean)).toHaveLength(5);
  });
});
