-- AlterTable
ALTER TABLE "user_saved_posts"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'idea',
ADD COLUMN "planned_for" TIMESTAMP(3),
ADD COLUMN "draft_text" TEXT,
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "user_saved_posts_user_id_status_idx" ON "user_saved_posts"("user_id", "status");
