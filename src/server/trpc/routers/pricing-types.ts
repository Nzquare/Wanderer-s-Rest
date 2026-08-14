import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import { router, staffProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNumOrNull } from "@/lib/decimal";
import { logAudit } from "@/server/audit";

/** Prisma's nullable Json columns want Prisma.JsonNull to clear, not a bare `null`. */
function jsonOrNull<T>(v: T[] | null | undefined) {
  if (v === undefined) return undefined;
  return v === null ? Prisma.JsonNull : v;
}

// Pricing types are financial/business configuration in the same spirit as
// Settings (§44's original "table pricing defaults" scope) — gated behind
// MANAGE_SETTINGS rather than a dedicated new Permission enum value, which
// would need its own migration plus a backfill onto every already-seeded
// installation's roles to actually take effect there.
const manage = () => permissionProcedure(Permission.MANAGE_SETTINGS);

const modelEnum = z.enum(["HOURLY", "FIXED", "PACKAGE"]);

const pricingTypeShape = z.object({
  code: z
    .string()
    .min(1)
    .max(30)
    .regex(/^[a-z0-9_]+$/i, "Letters, numbers, underscore only"),
  name: z.string().min(1),
  model: modelEnum,
  hourlyRate: z.number().min(0).optional().nullable(),
  fixedPrice: z.number().min(0).optional().nullable(),
  perPerson: z.boolean().default(true),
  dailyCap: z.number().min(0).optional().nullable(),
  gracePeriodMinutes: z.number().int().min(0).default(15),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  activeDays: z.array(z.number().int().min(0).max(6)).optional().nullable(),
  activeFrom: z.string().datetime().optional().nullable(),
  activeTo: z.string().datetime().optional().nullable(),
});

// Create needs the full shape so the model/rate cross-field check can run
// against a complete picture — same split as promotions.ts's
// promotionInput vs promotionShape.partial() for update.
const pricingTypeInput = pricingTypeShape
  .refine((v) => v.model !== "HOURLY" || v.hourlyRate != null, {
    message: "Hourly pricing needs an hourly rate.",
    path: ["hourlyRate"],
  })
  .refine((v) => v.model === "HOURLY" || v.fixedPrice != null, {
    message: "Fixed/Package pricing needs a fixed price.",
    path: ["fixedPrice"],
  });

function serialize(t: {
  id: string;
  code: string;
  name: string;
  model: string;
  hourlyRate: unknown;
  fixedPrice: unknown;
  perPerson: boolean;
  dailyCap: unknown;
  gracePeriodMinutes: number;
  startTime: string | null;
  endTime: string | null;
  activeDays: unknown;
  activeFrom: Date | null;
  activeTo: Date | null;
  active: boolean;
  sortOrder: number;
  _count?: { sessions: number; reservations: number };
}) {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    model: t.model as "HOURLY" | "FIXED" | "PACKAGE",
    hourlyRate: toNumOrNull(t.hourlyRate),
    fixedPrice: toNumOrNull(t.fixedPrice),
    perPerson: t.perPerson,
    dailyCap: toNumOrNull(t.dailyCap),
    gracePeriodMinutes: t.gracePeriodMinutes,
    startTime: t.startTime,
    endTime: t.endTime,
    activeDays: (t.activeDays as number[] | null) ?? null,
    activeFrom: t.activeFrom,
    activeTo: t.activeTo,
    active: t.active,
    sortOrder: t.sortOrder,
    inUse: t._count ? t._count.sessions > 0 || t._count.reservations > 0 : false,
  };
}

export const pricingTypesRouter = router({
  /**
   * Active-only, for the "open table" and reservation pricing pickers —
   * unchanged from before this router grew CRUD (those call sites only
   * ever needed a read).
   */
  list: staffProcedure.query(async ({ ctx }) => {
    const types = await ctx.prisma.pricingType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
    return types.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      model: t.model,
      hourlyRate: toNumOrNull(t.hourlyRate),
      fixedPrice: toNumOrNull(t.fixedPrice),
      perPerson: t.perPerson,
      dailyCap: toNumOrNull(t.dailyCap),
      gracePeriodMinutes: t.gracePeriodMinutes,
    }));
  }),

  /** Every pricing type, active or not — the Back Office management list. */
  listAll: manage().query(async ({ ctx }) => {
    const types = await ctx.prisma.pricingType.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { sessions: true, reservations: true } } },
    });
    return types.map(serialize);
  }),

  create: manage()
    .input(pricingTypeInput)
    .mutation(async ({ ctx, input }) => {
      const code = input.code.toUpperCase();
      const existing = await ctx.prisma.pricingType.findUnique({ where: { code } });
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Code "${code}" is already used.` });
      }
      const last = await ctx.prisma.pricingType.findFirst({ orderBy: { sortOrder: "desc" } });
      const { activeFrom, activeTo, activeDays, ...rest } = input;
      const created = await ctx.prisma.pricingType.create({
        data: {
          ...rest,
          code,
          activeDays: jsonOrNull(activeDays),
          activeFrom: activeFrom ? new Date(activeFrom) : undefined,
          activeTo: activeTo ? new Date(activeTo) : undefined,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
      });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "PRICING_TYPE_CREATED",
        entityType: "PricingType",
        entityId: created.id,
        newValue: { code: created.code, name: created.name, model: created.model },
      });
      return serialize({ ...created, _count: { sessions: 0, reservations: 0 } });
    }),

  update: manage()
    .input(pricingTypeShape.partial().extend({ id: z.string(), active: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, activeFrom, activeTo, activeDays, code, ...rest } = input;
      if (code !== undefined) {
        const upper = code.toUpperCase();
        const existing = await ctx.prisma.pricingType.findUnique({ where: { code: upper } });
        if (existing && existing.id !== id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Code "${upper}" is already used.` });
        }
      }
      const updated = await ctx.prisma.pricingType.update({
        where: { id },
        data: {
          ...rest,
          ...(code !== undefined ? { code: code.toUpperCase() } : {}),
          activeDays: jsonOrNull(activeDays),
          ...(activeFrom !== undefined
            ? { activeFrom: activeFrom ? new Date(activeFrom) : null }
            : {}),
          ...(activeTo !== undefined ? { activeTo: activeTo ? new Date(activeTo) : null } : {}),
        },
        include: { _count: { select: { sessions: true, reservations: true } } },
      });
      return serialize(updated);
    }),

  /**
   * True delete — only for a pricing type that's never actually been used
   * by a session or reservation. One that has stays forever via that
   * history (§45) and gets deactivated instead, same pattern as
   * menu/games/promotions.
   */
  remove: manage()
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const type = await ctx.prisma.pricingType.findUnique({
        where: { id: input.id },
        include: { _count: { select: { sessions: true, reservations: true } } },
      });
      if (!type) throw new TRPCError({ code: "NOT_FOUND" });
      if (type._count.sessions > 0 || type._count.reservations > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${type.name}" has already been used for a table session or reservation and can't be deleted — mark it Inactive instead.`,
        });
      }
      await ctx.prisma.pricingType.delete({ where: { id: input.id } });
      await logAudit(ctx.prisma, {
        staffId: ctx.staff.id,
        action: "PRICING_TYPE_DELETED",
        entityType: "PricingType",
        entityId: input.id,
        previousValue: { code: type.code, name: type.name },
      });
      return { ok: true };
    }),
});
