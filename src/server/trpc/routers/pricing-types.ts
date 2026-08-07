import { router, staffProcedure } from "../trpc";
import { toNumOrNull } from "@/lib/decimal";

export const pricingTypesRouter = router({
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
});
