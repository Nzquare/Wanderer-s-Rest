import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";
import type { Permission } from "@/generated/prisma/enums";
import { can } from "@/server/rbac/can";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

/** Any authenticated staff member (Staff Mobile-level access). */
export const staffProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.staff) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required." });
  }
  return next({ ctx: { ...ctx, staff: ctx.staff } });
});

/** Factory for procedures that require one specific permission (§2). */
export function permissionProcedure(permission: Permission) {
  return staffProcedure.use(({ ctx, next }) => {
    if (!can(ctx.staff, permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing permission: ${permission}`,
      });
    }
    return next({ ctx });
  });
}
