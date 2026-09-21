-- Reverts 20260921050000_menu_category_print_station — turned out to be
-- the wrong shape for §Separate kitchen ticket by category: it needed a
-- manual "print station" set per category before anything would split,
-- but the actual want is every category automatically getting its own
-- kitchen ticket, using the category's own existing name — no separate
-- field or setup step needed. Safe to run whether or not the column the
-- previous migration added ever actually existed on this database yet.
ALTER TABLE "MenuCategory" DROP COLUMN IF EXISTS "printStation";
