-- AlterTable
ALTER TABLE "users" ADD COLUMN     "digest_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "digest_hour" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "last_digest_at" TIMESTAMP(3),
ADD COLUMN     "telegram_chat_id" TEXT;
