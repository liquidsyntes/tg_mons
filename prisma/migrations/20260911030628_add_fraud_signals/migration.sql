-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN     "digest_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "digest_hour" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "last_digest_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" SERIAL NOT NULL,
    "channel_id" INTEGER,
    "metric" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_fired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_signals" (
    "id" SERIAL NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "signal_type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_rules_channel_id_idx" ON "alert_rules"("channel_id");

-- CreateIndex
CREATE INDEX "fraud_signals_channel_id_detected_at_idx" ON "fraud_signals"("channel_id", "detected_at");

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_signals" ADD CONSTRAINT "fraud_signals_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
