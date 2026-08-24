-- CreateTable
CREATE TABLE "mentions" (
    "id" SERIAL NOT NULL,
    "source_post_id" INTEGER NOT NULL,
    "source_channel_id" INTEGER NOT NULL,
    "target_username" TEXT,
    "target_tg_id" BIGINT,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mentions_source_channel_id_idx" ON "mentions"("source_channel_id");

-- CreateIndex
CREATE INDEX "mentions_target_username_idx" ON "mentions"("target_username");

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_source_post_id_fkey" FOREIGN KEY ("source_post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_source_channel_id_fkey" FOREIGN KEY ("source_channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
