-- Allow a game to be hard-deleted from the library even after it's been
-- played (§Delete a game). GameSession has no name snapshot the way
-- OrderItem does for menu items, so a deleted game's past plays fall
-- back to "Deleted game" / "Unknown" in the UI and reports instead of
-- losing the play record.
ALTER TABLE "GameSession" DROP CONSTRAINT "GameSession_gameId_fkey";
ALTER TABLE "GameSession" ALTER COLUMN "gameId" DROP NOT NULL;
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
