-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "content_type" TEXT NOT NULL DEFAULT 'text';

-- CreateIndex
CREATE INDEX "posts_channel_id_content_type_idx" ON "posts"("channel_id", "content_type");
