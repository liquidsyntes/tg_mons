-- CreateTable
CREATE TABLE "post_engagement_hours" (
    "id" SERIAL NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "post_id" INTEGER NOT NULL,
    "hour_start" TIMESTAMP(3) NOT NULL,
    "reactions_added" INTEGER NOT NULL DEFAULT 0,
    "forwards_added" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_engagement_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_engagement_hours_channel_id_hour_start_idx" ON "post_engagement_hours"("channel_id", "hour_start");

-- CreateIndex
CREATE INDEX "post_engagement_hours_hour_start_idx" ON "post_engagement_hours"("hour_start");

-- CreateIndex
CREATE UNIQUE INDEX "post_engagement_hours_post_id_hour_start_key" ON "post_engagement_hours"("post_id", "hour_start");

-- AddForeignKey
ALTER TABLE "post_engagement_hours" ADD CONSTRAINT "post_engagement_hours_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_engagement_hours" ADD CONSTRAINT "post_engagement_hours_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
