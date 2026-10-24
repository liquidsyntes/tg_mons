-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "events_scanned_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "posts_events_scanned_at_published_at_idx" ON "posts"("events_scanned_at", "published_at");
