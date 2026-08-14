import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentStaff } from "@/server/auth/current-user";
import { can } from "@/server/rbac/can";
import { Permission } from "@/server/rbac/permissions";
import { prisma } from "@/server/db";
import { logAudit } from "@/server/audit";
import { cellText, cellNumber, cellBoolean, headerColumnMap, type RowIssue } from "@/server/import/xlsx";

/**
 * Bulk menu import (Back Office -> Menu -> Import from Excel). A plain
 * Route Handler rather than a tRPC procedure — tRPC/superjson round-trips
 * JSON, not a multipart file upload — mirroring how the Excel *export*
 * route (src/app/api/reports/export) also bypasses tRPC for binary/file
 * handling.
 *
 * Matching rule: a row's Category is found-or-created by English name
 * (case-insensitive); within that category, an item is matched by English
 * name (case-insensitive) and *updated* rather than duplicated on re-import
 * — so re-uploading the same file after editing prices in Excel is the
 * expected workflow, not "always creates new rows."
 *
 * A column left out of the header row entirely is never touched on update
 * (e.g. a minimal file with just Category/Name/Price won't blank out
 * descriptions or flip Featured off on existing items) — only columns that
 * are actually present get applied, even when a given row's cell is blank.
 */
export async function POST(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!can(staff, Permission.MANAGE_MENU)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return Response.json({ error: "Couldn't read that file — is it a valid .xlsx?" }, { status: 400 });
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return Response.json({ error: "No worksheet found in the file." }, { status: 400 });
  }

  const headers = headerColumnMap(sheet);
  const col = (name: string) => headers.get(name.toLowerCase());
  const catEnCol = col("Category (EN)");
  const catThCol = col("Category (TH)");
  const nameEnCol = col("Item Name (EN)");
  const nameThCol = col("Item Name (TH)");
  const descEnCol = col("Description (EN)");
  const descThCol = col("Description (TH)");
  const priceCol = col("Price");
  const activeCol = col("Active");
  const featuredCol = col("Featured");
  const staffOnlyCol = col("Staff Only");

  if (!catEnCol || !nameEnCol || !priceCol) {
    return Response.json(
      {
        error:
          'Missing required column(s). Expected at least "Category (EN)", "Item Name (EN)", and "Price" — download the template for the full column list.',
      },
      { status: 400 },
    );
  }

  const existingCategories = await prisma.menuCategory.findMany();
  const categoryByNameEn = new Map(existingCategories.map((c) => [c.nameEn.toLowerCase(), c]));
  let nextCategorySort = existingCategories.length
    ? Math.max(...existingCategories.map((c) => c.sortOrder)) + 1
    : 0;

  const existingItems = await prisma.menuItem.findMany();
  const itemKey = (categoryId: string, nameEn: string) => `${categoryId}::${nameEn.toLowerCase()}`;
  const itemByKey = new Map(existingItems.map((i) => [itemKey(i.categoryId, i.nameEn), i]));
  const sortOrderByCategory = new Map<string, number>();
  for (const item of existingItems) {
    sortOrderByCategory.set(
      item.categoryId,
      Math.max(sortOrderByCategory.get(item.categoryId) ?? -1, item.sortOrder),
    );
  }

  let createdCategories = 0;
  let createdItems = 0;
  let updatedItems = 0;
  const errors: RowIssue[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const categoryNameEn = cellText(row.getCell(catEnCol).value);
    const nameEn = cellText(row.getCell(nameEnCol).value);
    if (!categoryNameEn && !nameEn) continue; // blank row

    if (!categoryNameEn || !nameEn) {
      errors.push({ row: rowNumber, message: "Missing Category (EN) or Item Name (EN)." });
      continue;
    }
    const price = cellNumber(row.getCell(priceCol).value);
    if (price == null || price < 0) {
      errors.push({ row: rowNumber, message: "Missing or invalid Price." });
      continue;
    }

    let category = categoryByNameEn.get(categoryNameEn.toLowerCase());
    if (!category) {
      category = await prisma.menuCategory.create({
        data: {
          nameEn: categoryNameEn,
          nameTh: (catThCol && cellText(row.getCell(catThCol).value)) || categoryNameEn,
          sortOrder: nextCategorySort++,
        },
      });
      categoryByNameEn.set(categoryNameEn.toLowerCase(), category);
      createdCategories++;
    }

    const key = itemKey(category.id, nameEn);
    const existing = itemByKey.get(key);

    if (existing) {
      const data: Record<string, unknown> = { basePrice: price };
      if (nameThCol) data.nameTh = cellText(row.getCell(nameThCol).value) || nameEn;
      if (descEnCol) data.descriptionEn = cellText(row.getCell(descEnCol).value) || null;
      if (descThCol) data.descriptionTh = cellText(row.getCell(descThCol).value) || null;
      if (activeCol) data.active = cellBoolean(row.getCell(activeCol).value, true);
      if (featuredCol) data.featured = cellBoolean(row.getCell(featuredCol).value, false);
      if (staffOnlyCol) data.staffOnly = cellBoolean(row.getCell(staffOnlyCol).value, false);
      await prisma.menuItem.update({ where: { id: existing.id }, data });
      updatedItems++;
    } else {
      const sortOrder = (sortOrderByCategory.get(category.id) ?? -1) + 1;
      sortOrderByCategory.set(category.id, sortOrder);
      const created = await prisma.menuItem.create({
        data: {
          categoryId: category.id,
          nameEn,
          nameTh: (nameThCol && cellText(row.getCell(nameThCol).value)) || nameEn,
          basePrice: price,
          descriptionEn: descEnCol ? cellText(row.getCell(descEnCol).value) || undefined : undefined,
          descriptionTh: descThCol ? cellText(row.getCell(descThCol).value) || undefined : undefined,
          active: activeCol ? cellBoolean(row.getCell(activeCol).value, true) : true,
          featured: featuredCol ? cellBoolean(row.getCell(featuredCol).value, false) : false,
          staffOnly: staffOnlyCol ? cellBoolean(row.getCell(staffOnlyCol).value, false) : false,
          sortOrder,
        },
      });
      itemByKey.set(key, created);
      createdItems++;
    }
  }

  if (createdCategories + createdItems + updatedItems > 0) {
    await logAudit(prisma, {
      staffId: staff!.id,
      action: "MENU_IMPORTED",
      entityType: "MenuItem",
      newValue: { createdCategories, createdItems, updatedItems, fileName: file.name },
    });
  }

  return Response.json({ createdCategories, createdItems, updatedItems, errors });
}
