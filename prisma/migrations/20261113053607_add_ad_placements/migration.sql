-- CreateTable
CREATE TABLE "ad_placements" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "target_channel_id" INTEGER NOT NULL,
    "donor_channel_id" INTEGER NOT NULL,
    "post_id" INTEGER,
    "price_amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "format" TEXT NOT NULL DEFAULT '1/24',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "scheduled_at" TIMESTAMP(3),
    "invite_link" TEXT,
    "actual_joins" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_placements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_placements_user_id_target_channel_id_idx" ON "ad_placements"("user_id", "target_channel_id");

-- CreateIndex
CREATE INDEX "ad_placements_user_id_donor_channel_id_idx" ON "ad_placements"("user_id", "donor_channel_id");

-- CreateIndex
CREATE INDEX "ad_placements_target_channel_id_idx" ON "ad_placements"("target_channel_id");

-- CreateIndex
CREATE INDEX "ad_placements_donor_channel_id_idx" ON "ad_placements"("donor_channel_id");

-- CreateIndex
CREATE INDEX "ad_placements_post_id_idx" ON "ad_placements"("post_id");

-- AddForeignKey
ALTER TABLE "ad_placements" ADD CONSTRAINT "ad_placements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_placements" ADD CONSTRAINT "ad_placements_target_channel_id_fkey" FOREIGN KEY ("target_channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_placements" ADD CONSTRAINT "ad_placements_donor_channel_id_fkey" FOREIGN KEY ("donor_channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_placements" ADD CONSTRAINT "ad_placements_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
