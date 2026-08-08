import { router, publicProcedure } from "../trpc";
import { sessionsRouter } from "./sessions";
import { pricingTypesRouter } from "./pricing-types";
import { membersRouter } from "./members";
import { menuRouter } from "./menu";
import { ordersRouter } from "./orders";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  sessions: sessionsRouter,
  pricingTypes: pricingTypesRouter,
  members: membersRouter,
  menu: menuRouter,
  orders: ordersRouter,
});

export type AppRouter = typeof appRouter;
