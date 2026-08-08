import { z } from "zod";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure } from "../trpc";

/**
 * Minimal member lookup/creation for POS-side linking (§25). Full profile
 * management, EXP history, and achievements live in Back Office (later
 * pass) — this only covers "find or quickly register a member at the till."
 */
export const membersRouter = router({
  search: staffProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      const members = await ctx.prisma.member.findMany({
        where: {
          status: { not: "BANNED" },
          OR: [
            { adventurerName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { memberCode: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
        orderBy: { lastVisit: "desc" },
      });
      return members.map((m) => ({
        id: m.id,
        memberCode: m.memberCode,
        adventurerName: m.adventurerName,
        phone: m.phone,
        lifetimeExp: m.lifetimeExp,
      }));
    }),

  quickCreate: staffProcedure
    .input(
      z.object({
        adventurerName: z.string().min(1).max(80),
        phone: z.string().max(30).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.phone) {
        const existing = await ctx.prisma.member.findUnique({
          where: { phone: input.phone },
        });
        if (existing) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `A member with phone ${input.phone} already exists (${existing.adventurerName}) — search for them instead.`,
          });
        }
      }
      const member = await ctx.prisma.member.create({
        data: {
          memberCode: `WR-${nanoid(8).toUpperCase()}`,
          adventurerName: input.adventurerName,
          phone: input.phone || null,
        },
      });
      return { id: member.id, adventurerName: member.adventurerName };
    }),
});
