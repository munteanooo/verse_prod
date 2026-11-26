import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../infrastructure/database/connection";
import { publishedDefinitions } from "./public-catalog";
import {
  measurementProfiles,
  measurementValues,
} from "../../infrastructure/database/profile-schema";
import { user } from "../../infrastructure/database/schema";
import {
  measurementSchema,
  profileInput,
  type MeasurementField,
} from "./measurements";

export class ProfileError extends Error {
  constructor(public code: "missing" | "invalid" | "conflict" | "limit") {
    super(code);
  }
}

export const listProfiles = (db: Database, owner: string) =>
  db
    .select({ id: measurementProfiles.id, name: measurementProfiles.name })
    .from(measurementProfiles)
    .where(eq(measurementProfiles.userId, owner))
    .orderBy(desc(measurementProfiles.updatedAt), asc(measurementProfiles.id))
    .limit(30);

const owns = (owner: string, id: string) =>
  and(eq(measurementProfiles.id, id), eq(measurementProfiles.userId, owner));

export async function readProfile(db: Database, owner: string, id: string) {
  return db.transaction(
    async (tx) => {
      const [profile] = await tx
        .select({
          id: measurementProfiles.id,
          name: measurementProfiles.name,
          revision: measurementProfiles.revision,
        })
        .from(measurementProfiles)
        .where(owns(owner, id));
      if (!profile) return;
      const values = await tx
        .select({
          definitionId: measurementValues.definitionId,
          length: measurementValues.length,
          key: measurementValues.key,
          name: measurementValues.name,
          description: measurementValues.description,
          instructions: measurementValues.instructions,
          unit: measurementValues.unit,
          precision: measurementValues.precision,
          min: measurementValues.min,
          max: measurementValues.max,
        })
        .from(measurementValues)
        .where(eq(measurementValues.profileId, id))
        .orderBy(
          asc(measurementValues.name),
          asc(measurementValues.definitionId),
        );
      return {
        ...profile,
        values: values.map(({ definitionId, length, ...field }) => ({
          length,
          field: {
            ...field,
            id: definitionId,
            required: false,
          } satisfies MeasurementField,
        })),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export type Profile = NonNullable<Awaited<ReturnType<typeof readProfile>>>;

export async function saveProfile(
  db: Database,
  owner: string,
  payload: unknown,
  id?: string,
) {
  const input = profileInput.parse(payload);
  return db.transaction(async (tx) => {
    if (id) {
      const [current] = await tx
        .select({ revision: measurementProfiles.revision })
        .from(measurementProfiles)
        .where(owns(owner, id))
        .for("update");
      if (!current) throw new ProfileError("missing");
      if (current.revision !== input.revision)
        throw new ProfileError("conflict");
    } else {
      const [account] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, owner))
        .for("update");
      if (!account) throw new ProfileError("missing");
      const [existing] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(measurementProfiles)
        .where(eq(measurementProfiles.userId, owner));
      if (existing.count >= 30) throw new ProfileError("limit");
    }
    const savedValues = id
      ? await tx
          .select()
          .from(measurementValues)
          .where(eq(measurementValues.profileId, id))
      : [];
    const savedIds = new Set(savedValues.map((value) => value.definitionId));
    const newIds = input.values
      .map((value) => value.definitionId)
      .filter((value) => !savedIds.has(value));
    const current = newIds.length ? await publishedDefinitions(tx, newIds) : [];
    const fields = new Map<string, MeasurementField>([
      ...savedValues.map(
        (value) =>
          [
            value.definitionId,
            { ...value, id: value.definitionId, required: false },
          ] as const,
      ),
      ...current.map(
        (value) => [value.id, { ...value, required: false }] as const,
      ),
    ]);
    const result = measurementSchema([...fields.values()]).safeParse(
      input.values,
    );
    if (!result.success) throw new ProfileError("invalid");
    const [saved] = id
      ? await tx
          .update(measurementProfiles)
          .set({
            name: input.name,
            updatedAt: new Date(),
            revision: (input.revision ?? 0) + 1,
          })
          .where(owns(owner, id))
          .returning({ id: measurementProfiles.id })
      : await tx
          .insert(measurementProfiles)
          .values({ name: input.name, userId: owner })
          .returning({ id: measurementProfiles.id });

    if (id)
      await tx
        .delete(measurementValues)
        .where(eq(measurementValues.profileId, id));
    if (result.data.length)
      await tx.insert(measurementValues).values(
        result.data.map((value) => {
          const field = fields.get(value.definitionId)!;
          const {
            key,
            name,
            description,
            instructions,
            unit,
            precision,
            min,
            max,
          } = field;
          return {
            ...value,
            profileId: saved.id,
            key,
            name,
            description,
            instructions,
            unit,
            precision,
            min,
            max,
          };
        }),
      );
    return saved;
  });
}

export async function deleteProfile(db: Database, owner: string, id: string) {
  const [deleted] = await db
    .delete(measurementProfiles)
    .where(owns(owner, id))
    .returning({ id: measurementProfiles.id });
  if (!deleted) throw new ProfileError("missing");
}
