import "server-only";
import { appRouter } from "./routers/_app";
import { createContext } from "./context";

/**
 * Typed, in-process tRPC caller for Server Components / Server Actions that
 * want the same validated mutations as the client without an HTTP round trip.
 */
export async function createServerCaller() {
  const ctx = await createContext();
  return appRouter.createCaller(ctx);
}
