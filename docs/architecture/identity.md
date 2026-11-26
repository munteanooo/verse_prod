# Identity database

The first migration is `drizzle/0000_identity.sql`. Drizzle owns the migration journal. Better Auth's core and two-factor plugin define the auth tables. No profile duplicates account names or emails.

| Table                 | Data and links                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `auth_users`          | User ID, unique email, verification status and MFA flag                                  |
| `auth_accounts`       | Credential account and salted password hash, keyed by user and unique provider identity  |
| `auth_sessions`       | Unique session token, indexed expiration and user FK with cascade                        |
| `auth_verifications`  | Short-lived Better Auth verification state, indexed by identifier and expiry             |
| `auth_two_factors`    | One row per user, with encrypted authenticator secret and recovery state                 |
| `user_roles`          | One enum assignment per user. An insert trigger creates CUSTOMER                         |
| `privileged_sessions` | Verified second-factor timestamp, keyed to the active session with cascade               |
| `auth_throttle`       | HMAC bucket ID, count and expiration in epoch milliseconds                               |
| `audit_logs`          | UUID event and correlation IDs, timestamp, optional actor FK, resource and safe metadata |

Auth and audit timestamps are timezone-aware. Role changes lock the target account and write the assignment, audit and session revocations transactionally. An operator event without a web actor has an empty actor ID and records the target and correlation ID.

## Database privileges

Run migrations using an operator account that owns the schema and objects. Create the runtime login with a securely set password. Review provider grants, memberships and database defaults so the runtime login lacks schema ownership and DDL privileges.

```sql
GRANT CONNECT ON DATABASE verse_prod TO verse_runtime;
GRANT USAGE ON SCHEMA public TO verse_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  auth_users, auth_accounts, auth_sessions, auth_verifications,
  auth_two_factors, auth_throttle TO verse_runtime;
GRANT SELECT ON user_roles TO verse_runtime;
GRANT SELECT, INSERT ON privileged_sessions TO verse_runtime;
GRANT INSERT ON audit_logs TO verse_runtime;
```

The registration trigger is owned by the operator and assigns the database's default role. Its search path is fixed and PUBLIC execute is revoked. Audit actor references become null if users are deleted. The operator owns retention and cleanup.

## Permissions

| Permission           | CUSTOMER | DESIGNER | ADMIN |
| -------------------- | -------- | -------- | ----- |
| `pattern:read`       | ✓        | ✓        | ✓     |
| `pattern:create`     |          | ✓        | ✓     |
| `pattern:update:own` |          | ✓        | ✓     |
| `pattern:update:any` |          |          | ✓     |
| `pattern:publish`    |          |          | ✓     |
| `pattern:archive`    |          |          | ✓     |
| `users:manage`       |          |          | ✓     |
| `audit:read`         |          |          | ✓     |
| `admin:access`       |          |          | ✓     |

`pattern:update:own` checks resource ownership. `admin:access` is the only permission used by an application route in this phase. Privileged permissions require MFA on the current session. The operator CLI is the only role assignment interface.
