-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "timeStr" TEXT,
    "organizer" TEXT,
    "prices" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_mentions" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "post_id" INTEGER NOT NULL,

    CONSTRAINT "event_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_metrics_daily" (
    "id" SERIAL NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "followers" INTEGER NOT NULL,
    "avgViews" INTEGER NOT NULL,
    "vr" DOUBLE PRECISION NOT NULL,
    "err" DOUBLE PRECISION NOT NULL,
    "postsCount" INTEGER NOT NULL,

    CONSTRAINT "channel_metrics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_mentions_event_id_idx" ON "event_mentions"("event_id");

-- CreateIndex
CREATE INDEX "event_mentions_post_id_idx" ON "event_mentions"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_mentions_event_id_post_id_key" ON "event_mentions"("event_id", "post_id");

-- CreateIndex
CREATE INDEX "channel_metrics_daily_date_idx" ON "channel_metrics_daily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "channel_metrics_daily_channel_id_date_key" ON "channel_metrics_daily"("channel_id", "date");

-- AddForeignKey
ALTER TABLE "event_mentions" ADD CONSTRAINT "event_mentions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_mentions" ADD CONSTRAINT "event_mentions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_metrics_daily" ADD CONSTRAINT "channel_metrics_daily_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
