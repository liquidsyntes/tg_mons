-- CreateEnum
CREATE TYPE "UserAccessStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "access_status" "UserAccessStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "telegram_name" TEXT,
ADD COLUMN     "telegram_photo_url" TEXT,
ADD COLUMN     "telegram_sub" TEXT,
ADD COLUMN     "telegram_username" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_sub_key" ON "users"("telegram_sub");
