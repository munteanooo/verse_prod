import { randomUUID } from "node:crypto";
import { readMigrationUrl } from "../../src/config/identity-environment";
import { assignRole } from "../../src/modules/identity/roles";
import { roles } from "../../src/modules/identity/policy";
import { email } from "../../src/modules/identity/validation";
import { openDatabase } from "../../src/infrastructure/database/connection";

async function run() {
  const [target, selected, ...extra] = process.argv.slice(2);
  const role = roles.find((candidate) => candidate === selected);
  const parsed = email.safeParse(target);
  if (!parsed.success || !role || extra.length)
    throw new Error(
      "Usage: pnpm identity:role <verified-email> <CUSTOMER|DESIGNER|ADMIN>",
    );
  const { db, close } = openDatabase(readMigrationUrl());
  try {
    const changed = await assignRole(db, parsed.data, role, randomUUID());
    console.log(
      changed
        ? "Role changed. Previous sessions were revoked."
        : "The account already has this role.",
    );
  } finally {
    await close();
  }
}

void run().catch(() => {
  console.error(
    "Role assignment failed. Check operator credentials, the requested role, and that the account is verified.",
  );
  process.exitCode = 1;
});
