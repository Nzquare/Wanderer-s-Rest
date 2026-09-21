-- Which physical kitchen ticket a category's items print on (§Separate
-- kitchen ticket by category) — free text so a café can name its own
-- stations (Kitchen, Bar, Dessert, ...). Defaults every existing
-- category to "Kitchen", preserving today's single-ticket-per-order
-- behavior until a café explicitly splits one out.
ALTER TABLE "MenuCategory" ADD COLUMN "printStation" TEXT NOT NULL DEFAULT 'Kitchen';
