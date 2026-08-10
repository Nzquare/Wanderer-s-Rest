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
import { achievementsRouter } from "./achievements";
import { gamesRouter } from "./games";
import { reservationsRouter } from "./reservations";
import { reportsRouter } from "./reports";
import { promotionsRouter } from "./promotions";

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
  achievements: achievementsRouter,
  games: gamesRouter,
  reservations: reservationsRouter,
  reports: reportsRouter,
  promotions: promotionsRouter,
});

export type AppRouter = typeof appRouter;
