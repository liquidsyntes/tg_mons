-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "is_ad" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "post_view_snapshots" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "hours_after_post" INTEGER NOT NULL,
    "views_count" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_view_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_view_snapshots_post_id_idx" ON "post_view_snapshots"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_view_snapshots_post_id_hours_after_post_key" ON "post_view_snapshots"("post_id", "hours_after_post");

-- AddForeignKey
ALTER TABLE "post_view_snapshots" ADD CONSTRAINT "post_view_snapshots_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
