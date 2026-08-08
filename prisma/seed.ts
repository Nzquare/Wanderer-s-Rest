import "dotenv/config";
import { prisma } from "../src/server/db";
import { hashSecret } from "../src/server/auth/password";
import {
  DEFAULT_ROLE_PERMISSIONS,
} from "../src/server/rbac/permissions";

async function main() {
  console.log("Seeding Wanderer's Rest...");

  // ── Roles + Permissions (§2) ─────────────────────────────────────────
  const roleIds: Record<string, string> = {};
  for (const [roleName, permissions] of Object.entries(
    DEFAULT_ROLE_PERMISSIONS,
  )) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName, isSystem: true },
      update: {},
    });
    roleIds[roleName] = role.id;
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permission: { roleId: role.id, permission } },
        create: { roleId: role.id, permission },
        update: {},
      });
    }
  }

  // ── Owner staff account (login: owner / PIN: 1234 — CHANGE IN PROD) ──
  const ownerPin = await hashSecret("1234");
  await prisma.staff.upsert({
    where: { loginId: "owner" },
    create: {
      name: "Owner",
      displayName: "Owner",
      loginId: "owner",
      pinHash: ownerPin,
      roleId: roleIds["Owner"],
      status: "ACTIVE",
      startDate: new Date(),
    },
    update: {},
  });

  // ── Table pricing types (§7) ─────────────────────────────────────────
  await prisma.pricingType.upsert({
    where: { code: "REGULAR" },
    create: {
      code: "REGULAR",
      name: "Regular",
      model: "HOURLY",
      hourlyRate: 60,
      perPerson: true,
      dailyCap: 199,
      gracePeriodMinutes: 15,
      sortOrder: 0,
    },
    update: {},
  });
  await prisma.pricingType.upsert({
    where: { code: "STUDENT" },
    create: {
      code: "STUDENT",
      name: "Student",
      model: "HOURLY",
      hourlyRate: 50,
      perPerson: true,
      dailyCap: 199,
      gracePeriodMinutes: 15,
      sortOrder: 1,
    },
    update: {},
  });

  // ── Reservation types (§9) ───────────────────────────────────────────
  await prisma.reservationType.upsert({
    where: { code: "CASUAL" },
    create: {
      code: "CASUAL",
      nameTh: "เล่นทั่วไป",
      nameEn: "Casual Play",
      requiresDeposit: false,
    },
    update: {},
  });
  await prisma.reservationType.upsert({
    where: { code: "DND" },
    create: {
      code: "DND",
      nameTh: "ดันเจี้ยนแอนด์ดราก้อน",
      nameEn: "D&D",
      requiresDeposit: true,
      defaultDepositAmount: 200,
    },
    update: {},
  });
  await prisma.reservationType.upsert({
    where: { code: "EVENT" },
    create: {
      code: "EVENT",
      nameTh: "อีเวนต์",
      nameEn: "Event",
      requiresDeposit: true,
      defaultDepositAmount: 200,
    },
    update: {},
  });
  await prisma.reservationType.upsert({
    where: { code: "PRIVATE" },
    create: {
      code: "PRIVATE",
      nameTh: "จองส่วนตัว",
      nameEn: "Private Booking",
      requiresDeposit: true,
      defaultDepositAmount: 200,
    },
    update: {},
  });

  // ── Ranks (§28) ───────────────────────────────────────────────────────
  const ranks: Array<[number, string, string]> = [
    [1, "มือใหม่", "Beginner"],
    [2, "นักผจญภัย", "Adventurer"],
    [3, "ทหารผ่านศึก", "Veteran"],
    [4, "ยอดฝีมือ", "Elite"],
    [5, "ตำนาน", "Legendary"],
  ];
  for (const [order, nameTh, nameEn] of ranks) {
    await prisma.rank.upsert({
      where: { order },
      create: { order, nameTh, nameEn, levelsRequired: 20 },
      update: {},
    });
  }

  // ── Adventurer classes (§29) ─────────────────────────────────────────
  const classes: Array<[string, string]> = [
    ["นักสู้", "Fighter"],
    ["นักปราชญ์", "Scholar"],
    ["ผู้ทำนาย", "Oracle"],
    ["นักดนตรี", "Bard"],
    ["นักพนัน", "Gambler"],
    ["ลูกเสือ", "Scout"],
    ["นักสำรวจ", "Explorer"],
  ];
  for (const [nameTh, nameEn] of classes) {
    const existing = await prisma.adventurerClass.findFirst({
      where: { nameEn },
    });
    if (!existing) {
      await prisma.adventurerClass.create({ data: { nameTh, nameEn } });
    }
  }

  // ── Demo tables (§4) ─────────────────────────────────────────────────
  const tables: Array<[string, string, number, string]> = [
    ["T1", "Table 1", 4, "Main Hall"],
    ["T2", "Table 2", 4, "Main Hall"],
    ["T3", "Table 3", 6, "Main Hall"],
    ["T4", "Table 4", 6, "Main Hall"],
    ["T5", "Table 5", 8, "Back Room"],
    ["T6", "Table 6", 2, "Window Nook"],
  ];
  for (const [index, [code, name, capacity, area]] of tables.entries()) {
    await prisma.restaurantTable.upsert({
      where: { code },
      create: { code, name, capacity, area, sortOrder: index },
      update: {},
    });
  }

  // ── Demo menu (§10, §11) ─────────────────────────────────────────────
  const drinksCategory = await prisma.menuCategory.upsert({
    where: { id: "seed-cat-drinks" },
    create: {
      id: "seed-cat-drinks",
      nameTh: "เครื่องดื่ม",
      nameEn: "Drinks",
      sortOrder: 0,
    },
    update: {},
  });
  const foodCategory = await prisma.menuCategory.upsert({
    where: { id: "seed-cat-food" },
    create: {
      id: "seed-cat-food",
      nameTh: "อาหาร",
      nameEn: "Food",
      sortOrder: 1,
    },
    update: {},
  });

  const potionSoda = await prisma.menuItem.upsert({
    where: { id: "seed-item-potion-soda" },
    create: {
      id: "seed-item-potion-soda",
      categoryId: drinksCategory.id,
      nameTh: "โซดายาโพชั่น",
      nameEn: "Potion Soda",
      basePrice: 80,
      sortOrder: 0,
    },
    update: {},
  });

  const friedChicken = await prisma.menuItem.upsert({
    where: { id: "seed-item-fried-chicken" },
    create: {
      id: "seed-item-fried-chicken",
      categoryId: foodCategory.id,
      nameTh: "ไก่ทอด",
      nameEn: "Fried Chicken",
      basePrice: 120,
      sortOrder: 0,
    },
    update: {},
  });

  const sizeGroup = await prisma.modifierGroup.upsert({
    where: { id: "seed-mg-size" },
    create: {
      id: "seed-mg-size",
      nameTh: "ขนาด",
      nameEn: "Size",
      required: true,
      multiSelect: false,
      minSelect: 1,
      maxSelect: 1,
    },
    update: {},
  });
  await prisma.modifierOption.upsert({
    where: { id: "seed-mo-size-regular" },
    create: {
      id: "seed-mo-size-regular",
      groupId: sizeGroup.id,
      nameTh: "ปกติ",
      nameEn: "Regular",
      priceAdjustment: 0,
      sortOrder: 0,
    },
    update: {},
  });
  await prisma.modifierOption.upsert({
    where: { id: "seed-mo-size-large" },
    create: {
      id: "seed-mo-size-large",
      groupId: sizeGroup.id,
      nameTh: "ใหญ่",
      nameEn: "Large",
      priceAdjustment: 40,
      sortOrder: 1,
    },
    update: {},
  });
  await prisma.menuItemModifierGroup.upsert({
    where: {
      menuItemId_modifierGroupId: {
        menuItemId: friedChicken.id,
        modifierGroupId: sizeGroup.id,
      },
    },
    create: { menuItemId: friedChicken.id, modifierGroupId: sizeGroup.id },
    update: {},
  });
  void potionSoda;

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
