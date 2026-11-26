import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
const created = () => time("created_at").notNull().defaultNow();
const updated = () =>
  time("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const user = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: created(),
  updatedAt: updated(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
});

export const session = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: time("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: created(),
    updatedAt: updated(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("auth_sessions_user_idx").on(t.userId),
    index("auth_sessions_expiration_idx").on(t.expiresAt),
  ],
);

export const account = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: time("access_token_expires_at"),
    refreshTokenExpiresAt: time("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique().on(t.providerId, t.accountId),
    index("auth_accounts_user_idx").on(t.userId),
  ],
);

export const verification = pgTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: time("expires_at").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("auth_verifications_identifier_idx").on(t.identifier),
    index("auth_verifications_expiration_idx").on(t.expiresAt),
  ],
);

export const twoFactor = pgTable(
  "auth_two_factors",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count")
      .notNull()
      .default(0),
    lockedUntil: time("locked_until"),
  },
  (t) => [unique().on(t.userId)],
);

export const roleType = pgEnum("verse_role", ["CUSTOMER", "DESIGNER", "ADMIN"]);

export const userRole = pgTable("user_roles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  role: roleType("role").notNull().default("CUSTOMER"),
  updatedAt: updated(),
});

export const auditLog = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    occurredAt: time("occurred_at").notNull().defaultNow(),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default({}),
    correlationId: uuid("correlation_id").notNull(),
  },
  (t) => [
    index("audit_logs_actor_idx").on(t.actorId, t.occurredAt),
    index("audit_logs_time_idx").on(t.occurredAt),
  ],
);

export const authThrottle = pgTable(
  "auth_throttle",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (t) => [index("auth_throttle_expiration_idx").on(t.expiresAt)],
);

export const privilegedSession = pgTable("privileged_sessions", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => session.id, { onDelete: "cascade" }),
  verifiedAt: time("verified_at").notNull().defaultNow(),
});
