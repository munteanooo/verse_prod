import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationUrl } from "../../src/config/identity-environment";
import { openDatabase } from "../../src/infrastructure/database/connection";

async function run() {
  const { db, close } = openDatabase(readMigrationUrl());
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("Identity migrations applied.");
  } finally {
    await close();
  }
}

void run().catch(() => {
  console.error(
    "Migration failed. Check the operator URL and PostgreSQL permissions.",
  );
  process.exitCode = 1;
});
