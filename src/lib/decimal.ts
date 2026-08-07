/** Converts a Prisma Decimal (or null) to a plain JS number for the wire. */
export function toNum(value: unknown): number {
  if (value == null) return 0;
  return Number(value);
}

export function toNumOrNull(value: unknown): number | null {
  if (value == null) return null;
  return Number(value);
}
