import { prisma } from "@/server/db";
import { settingsSchemas, type SettingsKey } from "./schema";
import type { z } from "zod";

type SchemaOf<K extends SettingsKey> = z.infer<(typeof settingsSchemas)[K]>;

/**
 * Reads a settings section, applying the section's Zod defaults for any
 * field not (yet) overridden in the database. This is the ONLY sanctioned
 * way to read a configurable business value — domain logic must never
 * import a default number directly.
 */
export async function getSettings<K extends SettingsKey>(
  key: K,
): Promise<SchemaOf<K>> {
  const row = await prisma.setting.findUnique({ where: { key } });
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
