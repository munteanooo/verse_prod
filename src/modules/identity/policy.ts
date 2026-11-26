export const roles = ["CUSTOMER", "DESIGNER", "ADMIN"] as const;
export type Role = (typeof roles)[number];

const permissions = [
  "pattern:read",
  "pattern:create",
  "pattern:update:own",
  "pattern:update:any",
  "pattern:publish",
  "pattern:archive",
  "users:manage",
  "audit:read",
  "admin:access",
] as const;

export type Permission = (typeof permissions)[number];

const grants: Record<Role, readonly Permission[]> = {
  CUSTOMER: ["pattern:read"],
  DESIGNER: ["pattern:read", "pattern:create", "pattern:update:own"],
  ADMIN: permissions,
};

export function can(
  role: Role | undefined,
  permission: Permission,
  resource?: { ownerId: string; actorId: string },
) {
  return Boolean(
    role &&
    grants[role].includes(permission) &&
    (permission !== "pattern:update:own" ||
      (resource && resource.ownerId === resource.actorId)),
  );
}

export function safeRedirect(value?: string, fallback = "/account") {
  const isLocalPath = (path: string) => /^\/(?!\/|%2f|%5c)/i.test(path);
  if (!value || !isLocalPath(value)) return fallback;
  if (
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 32 || code === 92 || code === 127;
    })
  )
    return fallback;

  const base = "https://verse.invalid";
  const parsed = new URL(value, base);
  return parsed.origin === base && isLocalPath(parsed.pathname)
    ? parsed.pathname + parsed.search + parsed.hash
    : fallback;
}
