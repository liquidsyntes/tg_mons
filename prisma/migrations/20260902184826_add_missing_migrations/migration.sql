-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "grouped_id" BIGINT;

-- CreateIndex
CREATE INDEX "posts_channel_id_grouped_id_idx" ON "posts"("channel_id", "grouped_id");
