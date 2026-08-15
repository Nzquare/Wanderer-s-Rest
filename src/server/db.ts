import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 requires an explicit driver adapter for SQL providers.
// A single pooled connection is reused across hot reloads in dev so we don't
// exhaust Postgres connections on every file save.

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    // checkout.recordPayment (and a couple other interactive transactions)
    // do several sequential writes — payments, member/EXP update, expHistory,
    // achievement unlocks, receipt, session + table status. Prisma's 5s
    // default timeout is tight for that under any real network latency to
    // the DB; a hosted/remote Postgres instance can blow past it even with
    // no bug involved. Raised as a safety net alongside trimming the actual
    // work done inside those transactions (see getSettings's client param).
    transactionOptions: {
      maxWait: 5_000,
      timeout: 20_000,
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
