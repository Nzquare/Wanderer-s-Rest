import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentStaff } from "@/server/auth/current-user";
import { can } from "@/server/rbac/can";
import { Permission } from "@/server/rbac/permissions";
import { prisma } from "@/server/db";
import { logAudit } from "@/server/audit";
import { cellText, cellNumber, headerColumnMap, type RowIssue } from "@/server/import/xlsx";

/**
 * Bulk game library import (Back Office -> Game Library -> Import from
 * Excel). Same pattern as the menu importer (src/app/api/menu/import) —
 * plain Route Handler for the multipart upload, columns matched by header
 * name so order doesn't matter, columns absent from the header are never
 * touched on update.
 *
 * Matching rule: a row's Category is found-or-created by English name; a
 * game is matched by English name (case-insensitive) *across the whole
 * library*, not scoped to category — board game titles are unique enough
 * in practice, and this is what makes re-importing after editing the sheet
 * update existing rows instead of duplicating them.
 *
 * Total Quantity is special: updating it shifts Available Quantity by the
 * same delta (clamped at 0) rather than overwriting it outright, so a
 * re-import doesn't silently "return" copies that are currently checked
 * out — see availableQuantity below.
 */
export async function POST(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!can(staff, Permission.MANAGE_GAMES)) {
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
  const nameEnCol = col("Game Name (EN)");
  const nameThCol = col("Game Name (TH)");
  const genreCol = col("Genre");
  const minCol = col("Min Players");
  const maxCol = col("Max Players");
  const minutesCol = col("Est. Minutes");
  const difficultyCol = col("Difficulty");
  const ageCol = col("Age Recommendation");
  const qtyCol = col("Total Quantity");

  if (!nameEnCol) {
    return Response.json(
      {
        error:
          'Missing required column "Game Name (EN)" — download the template for the full column list.',
      },
      { status: 400 },
    );
  }

  const existingCategories = await prisma.gameCategory.findMany();
  const categoryByNameEn = new Map(existingCategories.map((c) => [c.nameEn.toLowerCase(), c]));
  let nextCategorySort = existingCategories.length
    ? Math.max(...existingCategories.map((c) => c.sortOrder)) + 1
    : 0;

  const existingGames = await prisma.game.findMany();
  const gameByNameEn = new Map(existingGames.map((g) => [g.nameEn.toLowerCase(), g]));

  let createdCategories = 0;
  let createdGames = 0;
  let updatedGames = 0;
  const errors: RowIssue[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const nameEn = cellText(row.getCell(nameEnCol).value);
    if (!nameEn) continue; // blank row

    let categoryId: string | undefined;
    const categoryNameEn = catEnCol ? cellText(row.getCell(catEnCol).value) : "";
    if (categoryNameEn) {
      let category = categoryByNameEn.get(categoryNameEn.toLowerCase());
      if (!category) {
        category = await prisma.gameCategory.create({
          data: {
            nameEn: categoryNameEn,
            nameTh: (catThCol && cellText(row.getCell(catThCol).value)) || categoryNameEn,
            sortOrder: nextCategorySort++,
          },
        });
        categoryByNameEn.set(categoryNameEn.toLowerCase(), category);
        createdCategories++;
      }
      categoryId = category.id;
    }

    const minPlayers = minCol ? cellNumber(row.getCell(minCol).value) : null;
    const maxPlayers = maxCol ? cellNumber(row.getCell(maxCol).value) : null;
    if (minPlayers != null && maxPlayers != null && minPlayers > maxPlayers) {
      errors.push({ row: rowNumber, message: "Min Players is greater than Max Players." });
      continue;
    }

    const existing = gameByNameEn.get(nameEn.toLowerCase());
    if (existing) {
      const data: Record<string, unknown> = {};
      if (nameThCol) data.nameTh = cellText(row.getCell(nameThCol).value) || nameEn;
      if (catEnCol) data.categoryId = categoryId ?? null;
      if (genreCol) data.genre = cellText(row.getCell(genreCol).value) || null;
      if (minCol) data.minPlayers = minPlayers;
      if (maxCol) data.maxPlayers = maxPlayers;
      if (minutesCol) data.estimatedMinutes = cellNumber(row.getCell(minutesCol).value);
      if (difficultyCol) data.difficulty = cellText(row.getCell(difficultyCol).value) || null;
      if (ageCol) data.ageRecommendation = cellText(row.getCell(ageCol).value) || null;
      if (qtyCol) {
        const newTotal = cellNumber(row.getCell(qtyCol).value);
        if (newTotal != null && newTotal >= 0) {
          const delta = newTotal - existing.totalQuantity;
          data.totalQuantity = newTotal;
          data.availableQuantity = Math.max(0, existing.availableQuantity + delta);
        }
      }
      const updated = await prisma.game.update({ where: { id: existing.id }, data });
      gameByNameEn.set(nameEn.toLowerCase(), updated);
      updatedGames++;
    } else {
      const totalQuantity = qtyCol ? (cellNumber(row.getCell(qtyCol).value) ?? 1) : 1;
      const created = await prisma.game.create({
        data: {
          nameEn,
          nameTh: (nameThCol && cellText(row.getCell(nameThCol).value)) || nameEn,
          categoryId,
          genre: genreCol ? cellText(row.getCell(genreCol).value) || undefined : undefined,
          minPlayers: minPlayers ?? undefined,
          maxPlayers: maxPlayers ?? undefined,
          estimatedMinutes: minutesCol
            ? (cellNumber(row.getCell(minutesCol).value) ?? undefined)
            : undefined,
          difficulty: difficultyCol ? cellText(row.getCell(difficultyCol).value) || undefined : undefined,
          ageRecommendation: ageCol ? cellText(row.getCell(ageCol).value) || undefined : undefined,
          totalQuantity,
          availableQuantity: totalQuantity,
        },
      });
      gameByNameEn.set(nameEn.toLowerCase(), created);
      createdGames++;
    }
  }

  if (createdCategories + createdGames + updatedGames > 0) {
    await logAudit(prisma, {
      staffId: staff!.id,
      action: "GAMES_IMPORTED",
      entityType: "Game",
      newValue: { createdCategories, createdGames, updatedGames, fileName: file.name },
    });
  }

  return Response.json({ createdCategories, createdGames, updatedGames, errors });
}
