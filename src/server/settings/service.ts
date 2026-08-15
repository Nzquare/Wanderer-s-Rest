import { prisma } from "@/server/db";
import { settingsSchemas, type SettingsKey } from "./schema";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

type SchemaOf<K extends SettingsKey> = z.infer<(typeof settingsSchemas)[K]>;

/**
 * Reads a settings section, applying the section's Zod defaults for any
 * field not (yet) overridden in the database. This is the ONLY sanctioned
 * way to read a configurable business value — domain logic must never
 * import a default number directly.
 *
 * Pass the interactive-transaction client (`tx`) when calling this from
 * inside a `prisma.$transaction(async (tx) => ...)` block — using the
 * default global `prisma` there makes this query grab a *second* pooled
 * connection while the transaction is still holding its own, which under
 * any pool contention can stall long enough to blow the transaction's
 * timeout (seen as "batch query cannot be executed on an expired
 * transaction"). Defaults to the global client for the common case of
 * calling this outside a transaction.
 */
export async function getSettings<K extends SettingsKey>(
  key: K,
  client: Pick<Prisma.TransactionClient, "setting"> = prisma,
): Promise<SchemaOf<K>> {
  const row = await client.setting.findUnique({ where: { key } });
  const schema = settingsSchemas[key];
  return schema.parse(row?.value ?? {}) as SchemaOf<K>;
}

/**
 * Merges a partial update into a settings section and persists it.
 * Returns the full resolved section after the update.
 */
export async function updateSettings<K extends SettingsKey>(
  key: K,
  patch: Partial<SchemaOf<K>>,
): Promise<SchemaOf<K>> {
  const current = await getSettings(key);
  const schema = settingsSchemas[key];
  const next = schema.parse({ ...current, ...patch });
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: next },
    update: { value: next },
  });
  return next as SchemaOf<K>;
}

export async function getAllSettings() {
  const keys = Object.keys(settingsSchemas) as SettingsKey[];
  const entries = await Promise.all(
    keys.map(async (key) => [key, await getSettings(key)] as const),
  );
  return Object.fromEntries(entries) as {
    [K in SettingsKey]: SchemaOf<K>;
  };
}
