import { prisma } from "@/server/db";

/**
 * Trivial DB ping, no auth required. Two jobs:
 *   1. A standard uptime/health check for whoever's hosting this.
 *   2. Keep-warm target for the scheduled GitHub Action
 *      (.github/workflows/keep-warm.yml) — a free-tier Postgres host
 *      (Neon, Supabase, ...) auto-suspends its compute after a few minutes
 *      idle, and the next real request then eats a multi-second "wake up"
 *      penalty on top of its actual work. Pinging this on a schedule keeps
 *      a query landing often enough that the database never gets the
 *      chance to fall asleep, so staff never eat that penalty during a
 *      shift. Deliberately does the smallest possible real query (not
 *      just "is the process up") — waking the compute IS the point.
 */
export async function GET() {
  const start = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  return Response.json({ ok: true, ms: Date.now() - start });
}
