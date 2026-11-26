import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function openDatabase(url: string) {
  const client = postgres(url, {
    max: 2,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 20,
    max_lifetime: 300,
  });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof openDatabase>["db"];
