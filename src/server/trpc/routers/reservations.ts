import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure, cashierProcedure, permissionProcedure } from "../trpc";
import { Permission } from "@/server/rbac/permissions";
import { toNum } from "@/lib/decimal";

const manage = () => permissionProcedure(Permission.MANAGE_RESERVATIONS);

export const reservationsRouter = router({
  listTypes: staffProcedure.query(({ ctx }) => {
    return ctx.prisma.reservationType.findMany({
      where: { active: true },
      orderBy: { nameEn: "asc" },
    });
  }),

  /** Powers the Cashier dashboard's "Upcoming reservations" widget (§3). */
  listUpcoming: cashierProcedure.query(async ({ ctx }) => {
    const reservations = await ctx.prisma.reservation.findMany({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      include: { type: true, table: true, member: { select: { adventurerName: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 50,
    });
    // Decimal doesn't survive the wire as a number without this — same
    // toNum() convention used everywhere else a Decimal crosses into a
    // tRPC response.
    return reservations.map((r) => ({ ...r, depositAmount: toNum(r.depositAmount) }));
  }),

  list: manage().query(async ({ ctx }) => {
    const reservations = await ctx.prisma.reservation.findMany({
      include: { type: true, table: true, member: { select: { adventurerName: true } } },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
      take: 200,
    });
    return reservations.map((r) => ({ ...r, depositAmount: toNum(r.depositAmount) }));
  }),

  create: manage()
    .input(
      z.object({
        customerName: z.string().min(1),
        phone: z.string().min(1),
        date: z.string(), // ISO date, e.g. "2026-08-10"
        startTime: z.string(), // ISO datetime
        expectedDurationMinutes: z.number().int().min(15).default(120),
        partySize: z.number().int().min(1).max(50),
        typeId: z.string(),
        tableId: z.string().optional(),
        memberId: z.string().optional(),
        pricingTypeId: z.string().optional(),
        packageId: z.string().optional(),
        depositAmount: z.number().min(0).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const type = await ctx.prisma.reservationType.findUnique({
        where: { id: input.typeId },
      });
      if (!type) throw new TRPCError({ code: "NOT_FOUND", message: "Reservation type not found." });

      const depositAmount = input.depositAmount ?? (type.requiresDeposit ? Number(type.defaultDepositAmount ?? 0) : undefined);
      // Booking the reservation and collecting the deposit are two
      // different events — this mutation only does the first one, so it
      // must never claim PAID just because an amount was entered/computed
      // (§Reservation deposit accuracy). Staff mark it collected
      // separately once money actually changes hands (ReservationRow's
      // "Mark deposit paid" action).
      const depositStatus = !type.requiresDeposit ? "NOT_REQUIRED" : "PENDING";

      return ctx.prisma.reservation.create({
        data: {
          customerName: input.customerName,
          phone: input.phone,
          date: new Date(input.date),
          startTime: new Date(input.startTime),
          expectedDurationMinutes: input.expectedDurationMinutes,
          partySize: input.partySize,
          typeId: input.typeId,
          tableId: input.tableId,
          memberId: input.memberId,
          pricingTypeId: input.pricingTypeId,
          packageId: input.packageId,
          depositAmount,
          depositStatus,
          notes: input.notes,
          status: "CONFIRMED",
          createdById: ctx.staff.id,
        },
      });
    }),

  update: manage()
    .input(
      z.object({
        id: z.string(),
        customerName: z.string().min(1).optional(),
        phone: z.string().min(1).optional(),
        partySize: z.number().int().min(1).max(50).optional(),
        tableId: z.string().nullable().optional(),
        notes: z.string().optional(),
        status: z
          .enum(["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"])
          .optional(),
        depositStatus: z.enum(["NOT_REQUIRED", "PENDING", "PAID", "REFUNDED", "FORFEITED"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.reservation.update({ where: { id }, data });
    }),

  /** Reservation -> assign table -> open session, carrying over party size/notes/member/package (§9). */
  checkIn: manage()
    .input(z.object({ reservationId: z.string(), tableId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const reservation = await tx.reservation.findUnique({
          where: { id: input.reservationId },
        });
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (!["PENDING", "CONFIRMED"].includes(reservation.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Reservation already checked in, completed, or cancelled.",
          });
        }
        const table = await tx.restaurantTable.findUnique({ where: { id: input.tableId } });
        if (!table || !table.active || !["AVAILABLE", "RESERVED"].includes(table.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Table is not available." });
        }

        let pricingTypeId = reservation.pricingTypeId;
        if (!pricingTypeId) {
          const regular = await tx.pricingType.findUnique({ where: { code: "REGULAR" } });
          pricingTypeId = regular?.id ?? null;
        }

        const now = new Date();
        const session = await tx.tableSession.create({
          data: {
            tableId: table.id,
            status: "OPEN",
            startTime: now,
            playerCount: reservation.partySize,
            pricingTypeId,
            packageId: reservation.packageId,
            memberId: reservation.memberId,
            reservationId: reservation.id,
            notes: reservation.notes,
            createdById: ctx.staff.id,
            players: {
              create: Array.from({ length: reservation.partySize }, (_, i) => ({
                label: `Player ${i + 1}`,
                startTime: now,
                status: "ACTIVE" as const,
                addedById: ctx.staff.id,
              })),
            },
          },
        });

        await tx.restaurantTable.update({
          where: { id: table.id },
          data: { status: "PLAYING" },
        });
        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: "CHECKED_IN", tableId: table.id },
        });

        return { sessionId: session.id, tableId: table.id };
      });
    }),
});
