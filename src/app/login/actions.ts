"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { verifySecret } from "@/server/auth/password";
import { createSessionToken, setSessionCookie } from "@/server/auth/session";

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const loginId = String(formData.get("loginId") ?? "").trim();
  const secret = String(formData.get("secret") ?? "");

  if (!loginId || !secret) {
    return { error: "Enter your login ID and PIN/password." };
  }

  const staff = await prisma.staff.findUnique({ where: { loginId } });
  if (!staff || staff.status !== "ACTIVE") {
    return { error: "Login not found or inactive." };
  }

  const candidates = [staff.pinHash, staff.passwordHash].filter(
    (h): h is string => !!h,
  );
  let ok = false;
  for (const hash of candidates) {
    if (await verifySecret(secret, hash)) {
      ok = true;
      break;
    }
  }
  if (!ok) {
    return { error: "Incorrect PIN or password." };
  }

  const token = await createSessionToken({ staffId: staff.id });
  await setSessionCookie(token);
  redirect("/");
}
