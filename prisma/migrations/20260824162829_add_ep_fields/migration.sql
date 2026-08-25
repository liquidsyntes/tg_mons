-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "niche" TEXT NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "comments" INTEGER,
ADD COLUMN     "forwards" INTEGER,
ADD COLUMN     "reactions" INTEGER;
