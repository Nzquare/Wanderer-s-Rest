import ExcelJS from "exceljs";
import { getCurrentStaff } from "@/server/auth/current-user";
import { can } from "@/server/rbac/can";
import { Permission } from "@/server/rbac/permissions";

/** Blank starter workbook for the Menu importer (see ../import/route.ts). */
export async function GET() {
  const staff = await getCurrentStaff();
  if (!can(staff, Permission.MANAGE_MENU)) {
    return new Response("Forbidden", { status: 403 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Wanderer's Rest";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Menu");
  sheet.columns = [
    { header: "Category (EN)", key: "categoryEn", width: 20 },
    { header: "Category (TH)", key: "categoryTh", width: 20 },
    { header: "Item Name (EN)", key: "nameEn", width: 24 },
    { header: "Item Name (TH)", key: "nameTh", width: 24 },
    { header: "Description (EN)", key: "descEn", width: 30 },
    { header: "Description (TH)", key: "descTh", width: 30 },
    { header: "Price", key: "price", width: 10 },
    { header: "Active", key: "active", width: 10 },
    { header: "Featured", key: "featured", width: 10 },
    { header: "Staff Only", key: "staffOnly", width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    categoryEn: "Drinks",
    categoryTh: "เครื่องดื่ม",
    nameEn: "Iced Latte",
    nameTh: "ลาเต้เย็น",
    descEn: "Espresso with cold milk",
    descTh: "เอสเปรสโซกับนมเย็น",
    price: 65,
    active: "TRUE",
    featured: "FALSE",
    staffOnly: "FALSE",
  });
  sheet.addRow({
    categoryEn: "Drinks",
    categoryTh: "เครื่องดื่ม",
    nameEn: "Hot Chocolate",
    nameTh: "ช็อกโกแลตร้อน",
    price: 70,
    active: "TRUE",
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="wanderers-rest-menu-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
