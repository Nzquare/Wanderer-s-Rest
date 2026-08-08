import { router, publicProcedure } from "../trpc";
import { sessionsRouter } from "./sessions";
import { pricingTypesRouter } from "./pricing-types";
import { membersRouter } from "./members";
import { menuRouter } from "./menu";
import { ordersRouter } from "./orders";
import { shiftsRouter } from "./shifts";
import { checkoutRouter } from "./checkout";
import { settingsRouter } from "./settings";
import { tablesRouter } from "./tables";
import { staffRouter } from "./staff";
import { customerRouter } from "./customer";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  sessions: sessionsRouter,
  pricingTypes: pricingTypesRouter,
  members: membersRouter,
  menu: menuRouter,
  orders: ordersRouter,
  shifts: shiftsRouter,
  checkout: checkoutRouter,
  settings: settingsRouter,
  tables: tablesRouter,
  staff: staffRouter,
  customer: customerRouter,
});

export type AppRouter = typeof appRouter;
