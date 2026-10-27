-- AlterTable
ALTER TABLE "user_channels" ADD COLUMN     "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
