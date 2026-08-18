-- AlterTable
-- Both were dead: GameStatus was never read or written anywhere in the
-- app (the Game Library's own status feature was already removed from
-- the UI in an earlier change; this just finishes it), and
-- availableQuantity always equalled totalQuantity in practice — nothing
-- ever decremented it when a game got played, so it carried no real
-- information beyond what totalQuantity already had.
ALTER TABLE "Game" DROP COLUMN "availableQuantity";
ALTER TABLE "Game" DROP COLUMN "status";

-- DropEnum
DROP TYPE "public"."GameStatus";
