import ExcelJS from "exceljs";
import { getCurrentStaff } from "@/server/auth/current-user";
import { can } from "@/server/rbac/can";
import { Permission } from "@/server/rbac/permissions";

/** Blank starter workbook for the Game Library importer (see ../import/route.ts). */
export async function GET() {
  const staff = await getCurrentStaff();
  if (!can(staff, Permission.MANAGE_GAMES)) {
    return new Response("Forbidden", { status: 403 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Wanderer's Rest";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Games");
  sheet.columns = [
    { header: "Category (EN)", key: "categoryEn", width: 18 },
    { header: "Category (TH)", key: "categoryTh", width: 18 },
    { header: "Game Name (EN)", key: "nameEn", width: 24 },
    { header: "Game Name (TH)", key: "nameTh", width: 24 },
    { header: "Genre", key: "genre", width: 16 },
    { header: "Min Players", key: "minPlayers", width: 12 },
    { header: "Max Players", key: "maxPlayers", width: 12 },
    { header: "Est. Minutes", key: "minutes", width: 12 },
    { header: "Difficulty", key: "difficulty", width: 14 },
    { header: "Age Recommendation", key: "age", width: 16 },
    { header: "Total Quantity", key: "quantity", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    categoryEn: "Strategy",
    categoryTh: "กลยุทธ์",
    nameEn: "Catan",
    nameTh: "คาทาน",
    genre: "Trading",
    minPlayers: 3,
    maxPlayers: 4,
    minutes: 90,
    difficulty: "Medium",
    age: "10+",
    quantity: 2,
  });
  sheet.addRow({
    categoryEn: "Party",
    categoryTh: "ปาร์ตี้",
    nameEn: "Codenames",
    nameTh: "โค้ดเนมส์",
    minPlayers: 4,
    maxPlayers: 8,
    minutes: 20,
    quantity: 1,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="wanderers-rest-games-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
