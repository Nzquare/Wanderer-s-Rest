import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifySecret(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Same PIN-or-password check the login form uses (src/app/login/actions.ts),
 * reused wherever an accountability-sensitive action (void, refund) needs to
 * confirm the staff member it's being assigned to actually authorized it —
 * picking a name from a dropdown alone proves nothing.
 */
export async function verifyStaffSecret(
  staff: { pinHash: string | null; passwordHash: string | null },
  secret: string,
): Promise<boolean> {
  const candidates = [staff.pinHash, staff.passwordHash].filter(
    (h): h is string => !!h,
  );
  for (const hash of candidates) {
    if (await verifySecret(secret, hash)) return true;
  }
  return false;
}
