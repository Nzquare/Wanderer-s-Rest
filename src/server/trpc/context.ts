import { prisma } from "@/server/db";
import { getCurrentStaff } from "@/server/auth/current-user";

export async function createContext() {
  const staff = await getCurrentStaff();
  return { prisma, staff };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
