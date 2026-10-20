-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "used_by_id" INTEGER,
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_channels" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "is_mine" BOOLEAN NOT NULL DEFAULT false,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "niche" TEXT NOT NULL DEFAULT 'general',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_dismissed_events" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "event_id" INTEGER NOT NULL,
    "dismissed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_dismissed_events_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ai_reports" ADD COLUMN "user_id" INTEGER;

-- AlterTable
ALTER TABLE "alert_rules" ADD COLUMN "user_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_used_by_id_key" ON "invite_codes"("used_by_id");

-- CreateIndex
CREATE INDEX "invite_codes_created_by_id_idx" ON "invite_codes"("created_by_id");

-- CreateIndex
CREATE INDEX "user_channels_user_id_idx" ON "user_channels"("user_id");

-- CreateIndex
CREATE INDEX "user_channels_channel_id_idx" ON "user_channels"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_channels_user_id_channel_id_key" ON "user_channels"("user_id", "channel_id");

-- CreateIndex
CREATE INDEX "user_dismissed_events_user_id_idx" ON "user_dismissed_events"("user_id");

-- CreateIndex
CREATE INDEX "user_dismissed_events_event_id_idx" ON "user_dismissed_events"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_dismissed_events_user_id_event_id_key" ON "user_dismissed_events"("user_id", "event_id");

-- CreateIndex
CREATE INDEX "ai_reports_user_id_created_at_idx" ON "ai_reports"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "alert_rules_user_id_idx" ON "alert_rules"("user_id");

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_used_by_id_fkey" FOREIGN KEY ("used_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_channels" ADD CONSTRAINT "user_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_channels" ADD CONSTRAINT "user_channels_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dismissed_events" ADD CONSTRAINT "user_dismissed_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dismissed_events" ADD CONSTRAINT "user_dismissed_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
