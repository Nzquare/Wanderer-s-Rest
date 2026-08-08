import { router, publicProcedure } from "../trpc";
import { sessionsRouter } from "./sessions";
import { pricingTypesRouter } from "./pricing-types";
import { membersRouter } from "./members";
import { menuRouter } from "./menu";
import { ordersRouter } from "./orders";
import { shiftsRouter } from "./shifts";
import { checkoutRouter } from "./checkout";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  sessions: sessionsRouter,
  pricingTypes: pricingTypesRouter,
  members: membersRouter,
  menu: menuRouter,
  orders: ordersRouter,
  shifts: shiftsRouter,
  checkout: checkoutRouter,
});

export type AppRouter = typeof appRouter;
