/**
 * Turns an achievement's benefitType/benefitConfig into a plain, readable
 * label — used everywhere a member's earned benefit needs to be shown to
 * a person deciding whether to redeem it (staff Adventurer Profile,
 * Cashier, the member self-service page). See achievements.ts's
 * benefitConfigSchema for what each field means per type.
 */
export function describeBenefit(benefitType: string | null | undefined, benefitConfig: unknown): string {
  const cfg = (benefitConfig ?? {}) as Record<string, unknown>;
  switch (benefitType) {
    case "FREE_ITEM":
      return `Free item — ${cfg.menuItemName || "ask staff which item"}`;
    case "FREE_DRINK":
      return `Free food or drink — ${cfg.menuItemName || "ask staff which item"}`;
    case "FIXED_DISCOUNT":
      return `฿${Number(cfg.value ?? 0)} off`;
    case "PERCENT_DISCOUNT":
      return `${Number(cfg.value ?? 0)}% off`;
    case "FREE_TABLE_TIME":
      return `${Number(cfg.value ?? 0)} minutes free playtime`;
    case "SPECIAL_PRICE":
      return cfg.description ? String(cfg.description) : "Special price — ask staff";
    case "PRIVILEGE":
      return cfg.description ? String(cfg.description) : "Special privilege — ask staff";
    case "CUSTOM":
      return cfg.description ? String(cfg.description) : "Ask staff about this reward";
    default:
      return "Reward — ask staff";
  }
}
