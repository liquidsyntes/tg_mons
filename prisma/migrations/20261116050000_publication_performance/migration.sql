-- AlterTable
ALTER TABLE "user_saved_posts" ADD COLUMN     "publication_linked_at" TIMESTAMP(3),
ADD COLUMN     "published_post_id" INTEGER;

-- CreateTable
CREATE TABLE "post_performance_checkpoints" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "hours_after_post" INTEGER NOT NULL,
    "views" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'collector',

    CONSTRAINT "post_performance_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_performance_checkpoints_post_id_hours_after_post_key" ON "post_performance_checkpoints"("post_id", "hours_after_post");

-- CreateIndex
CREATE INDEX "user_saved_posts_published_post_id_idx" ON "user_saved_posts"("published_post_id");

-- AddForeignKey
ALTER TABLE "user_saved_posts" ADD CONSTRAINT "user_saved_posts_published_post_id_fkey" FOREIGN KEY ("published_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_performance_checkpoints" ADD CONSTRAINT "post_performance_checkpoints_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

