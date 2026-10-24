-- CreateTable
CREATE TABLE "alert_rule_fires" (
    "id" SERIAL NOT NULL,
    "rule_id" INTEGER NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "last_fired_at" TIMESTAMP(3) NOT NULL,
    "last_value" DOUBLE PRECISION,

    CONSTRAINT "alert_rule_fires_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_rule_fires_channel_id_idx" ON "alert_rule_fires"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rule_fires_rule_id_channel_id_key" ON "alert_rule_fires"("rule_id", "channel_id");

-- AddForeignKey
ALTER TABLE "alert_rule_fires" ADD CONSTRAINT "alert_rule_fires_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_fires" ADD CONSTRAINT "alert_rule_fires_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve cooldown for channel-specific rules. Global rules have no recorded channel to restore.
INSERT INTO "alert_rule_fires" ("rule_id", "channel_id", "last_fired_at")
SELECT "id", "channel_id", "last_fired_at"
FROM "alert_rules"
WHERE "channel_id" IS NOT NULL AND "last_fired_at" IS NOT NULL;
