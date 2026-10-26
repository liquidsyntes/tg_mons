-- AlterTable
ALTER TABLE "alert_rules" ADD COLUMN     "keyword_query" TEXT;

-- CreateTable
CREATE TABLE "alert_rule_post_fires" (
    "id" SERIAL NOT NULL,
    "rule_id" INTEGER NOT NULL,
    "post_id" INTEGER NOT NULL,
    "fired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rule_post_fires_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_rule_post_fires_post_id_idx" ON "alert_rule_post_fires"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rule_post_fires_rule_id_post_id_key" ON "alert_rule_post_fires"("rule_id", "post_id");

-- AddForeignKey
ALTER TABLE "alert_rule_post_fires" ADD CONSTRAINT "alert_rule_post_fires_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_post_fires" ADD CONSTRAINT "alert_rule_post_fires_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
