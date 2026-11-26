import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import { project } from "../../config/project";
import { readIdentityEnvironment } from "../../config/identity-environment";
import { recordAudit } from "../../modules/identity/audit";
import { safeRedirect } from "../../modules/identity/policy";
import { readRole } from "../../modules/identity/roles";
import { openDatabase, type Database } from "../database/connection";
import * as schema from "../database/schema";
import { smtpEmail, type SendIdentityEmail } from "./email";

type Config = NonNullable<ReturnType<typeof readIdentityEnvironment>>;

export function createIdentity(
  db: Database,
  config: Config,
  sendEmail?: SendIdentityEmail,
  tokenExpiry = { verification: 1800, reset: 900 },
) {
  const send = async (
    recipient: string,
    kind: "verification" | "password-reset",
    token: string,
  ) => {
    if (!sendEmail) throw new APIError("SERVICE_UNAVAILABLE");
    try {
      const route =
        kind === "verification"
          ? project.routes.verifyEmail
          : project.routes.resetPassword;
      const link = new URL(safeRedirect(route), config.origin);
      // Fragments are not transmitted to HTTP servers or access logs.
      link.hash = new URLSearchParams({ token }).toString();
      await sendEmail({ recipient, kind, url: link.href });
    } catch {
      // The SMTP error can include recipient or message data.
      console.error("Identity email delivery failed.");
      throw new APIError("SERVICE_UNAVAILABLE");
    }
  };

  const auth = betterAuth({
    appName: project.brand,
    baseURL: config.origin,
    secret: config.secret,
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    trustedOrigins: [config.origin],
    advanced: {
      useSecureCookies: new URL(config.origin).protocol === "https:",
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
      ipAddress: { disableIpTracking: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    verification: { storeIdentifier: "hashed" },
    logger: { disabled: true },
    telemetry: { enabled: false },
    rateLimit: { enabled: false }, // The HTTP boundary uses an atomic PostgreSQL limiter.
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: tokenExpiry.reset,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, token }) =>
        send(user.email, "password-reset", token),
      onPasswordReset: async ({ user }, request) => {
        const role = await readRole(db, user.id);
        if (role && role !== "CUSTOMER")
          await recordAudit(db, {
            actorId: user.id,
            action: "privileged.sessions.revoked",
            resourceType: "user",
            resourceId: user.id,
            correlationId:
              request?.headers.get("x-verse-correlation-id") ?? undefined,
            metadata: { reason: "password-reset" },
          });
      },
    },
    emailVerification: {
      expiresIn: tokenExpiry.verification,
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      sendVerificationEmail: ({ user, token }) =>
        send(user.email, "verification", token),
    },
    plugins: [twoFactor({ issuer: project.brand })],
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const next = ctx.context.newSession;
        if (
          !next ||
          ![
            "/two-factor/verify-totp",
            "/two-factor/verify-backup-code",
          ].includes(ctx.path)
        )
          return;
        const role = await readRole(db, next.user.id);
        if (role !== "ADMIN" && role !== "DESIGNER") return;
        await db.transaction(async (tx) => {
          await tx
            .insert(schema.privilegedSession)
            .values({ sessionId: next.session.id })
            .onConflictDoNothing();
          await recordAudit(tx, {
            actorId: next.user.id,
            action: "privileged.authenticated",
            resourceType: "user",
            resourceId: next.user.id,
            correlationId:
              ctx.request?.headers.get("x-verse-correlation-id") ?? undefined,
            metadata: {
              factor:
                ctx.path === "/two-factor/verify-totp"
                  ? "totp"
                  : "recovery-code",
            },
          });
        });
      }),
    },
  });
  return { auth, db, config, emailConfigured: Boolean(sendEmail) };
}

let identity: ReturnType<typeof createIdentity> | undefined;

export function getIdentity() {
  if (identity) return identity;
  const config = readIdentityEnvironment();
  if (!config) return undefined;
  const { db } = openDatabase(config.databaseUrl);
  const sendEmail =
    config.smtp && config.emailFrom
      ? smtpEmail(config.smtp, config.emailFrom)
      : undefined;
  identity = createIdentity(db, config, sendEmail);
  return identity;
}
