import { router, publicProcedure } from "../trpc";
import { sessionsRouter } from "./sessions";
import { pricingTypesRouter } from "./pricing-types";
import { membersRouter } from "./members";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  sessions: sessionsRouter,
  pricingTypes: pricingTypesRouter,
  members: membersRouter,
});

export type AppRouter = typeof appRouter;
