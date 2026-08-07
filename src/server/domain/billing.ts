/**
 * Session bill aggregation (§20, §45). Pulls table fee + food/drink totals +
 * discounts + tax/service charge into one snapshot-able result. This is the
 * ONLY place checkout totals get computed, so historical sessions replaying
 * their stored snapshot never have to re-derive this math from current
 * Settings.
 */

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export interface BillInput {
  tableFeeTotal: number;
  foodDrinkSubtotal: number;
  discounts: Array<{ promotionId: string | null; label: string; amount: number }>;
  taxEnabled: boolean;
  taxPercent: number;
  serviceChargeEnabled: boolean;
  serviceChargePercent: number;
}

export interface BillResult {
  subtotalTableFee: number;
  subtotalFoodDrink: number;
  discountTotal: number;
  serviceChargeAmount: number;
  taxAmount: number;
  total: number;
  discounts: BillInput["discounts"];
}

export function computeBill(input: BillInput): BillResult {
  const discountTotal = round2(
    input.discounts.reduce((sum, d) => sum + d.amount, 0),
  );
  const base = Math.max(
    0,
    round2(input.tableFeeTotal + input.foodDrinkSubtotal - discountTotal),
  );
  const serviceChargeAmount = input.serviceChargeEnabled
    ? round2(base * (input.serviceChargePercent / 100))
    : 0;
  const taxAmount = input.taxEnabled
    ? round2((base + serviceChargeAmount) * (input.taxPercent / 100))
    : 0;
  const total = round2(base + serviceChargeAmount + taxAmount);

  return {
    subtotalTableFee: round2(input.tableFeeTotal),
    subtotalFoodDrink: round2(input.foodDrinkSubtotal),
    discountTotal,
    serviceChargeAmount,
    taxAmount,
    total,
    discounts: input.discounts,
  };
}

/** Eligible spending for EXP purposes = table fee + food/drink, net of discounts (§23, §26). */
export function eligibleExpSpending(bill: BillResult): number {
  return Math.max(
    0,
    round2(bill.subtotalTableFee + bill.subtotalFoodDrink - bill.discountTotal),
  );
}
