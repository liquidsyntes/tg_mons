-- AlterTable
ALTER TABLE "posts" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_after_hours" INTEGER,
ADD COLUMN "last_checked_at" TIMESTAMP(3);
