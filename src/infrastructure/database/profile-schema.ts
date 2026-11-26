import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { lengthUnit, measurementDefinitions } from "./catalog-schema";
import { user } from "./schema";

export const measurementProfiles = pgTable(
  "measurement_profiles",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    revision: integer().notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("measurement_profiles_owner_idx").on(t.userId, t.updatedAt),
    check("profile_revision_nonnegative", sql`${t.revision} >= 0`),
  ],
);

export const measurementValues = pgTable(
  "measurement_values",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => measurementProfiles.id, { onDelete: "cascade" }),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => measurementDefinitions.id, { onDelete: "restrict" }),
    length: integer().notNull(),
    key: text().notNull(),
    name: text().notNull(),
    description: text().notNull(),
    instructions: text().notNull(),
    unit: lengthUnit().notNull(),
    precision: integer(),
    min: integer().notNull(),
    max: integer().notNull(),
  },
  (t) => [
    primaryKey({
      name: "profile_definition_pk",
      columns: [t.profileId, t.definitionId],
    }),
    index("measurement_values_definition_idx").on(t.definitionId),
    check(
      "profile_measurement_bounds",
      sql`${t.min} >= 0 and ${t.max} <= 10000000 and ${t.length} between ${t.min} and ${t.max} and (${t.precision} is null or ${t.precision} between 0 and 3)`,
    ),
  ],
);
