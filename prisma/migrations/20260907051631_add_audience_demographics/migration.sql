-- CreateTable
CREATE TABLE "audience_demographics" (
    "id" SERIAL NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "language_breakdown" JSONB NOT NULL,

    CONSTRAINT "audience_demographics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audience_demographics_channel_id_captured_at_idx" ON "audience_demographics"("channel_id", "captured_at");

-- AddForeignKey
ALTER TABLE "audience_demographics" ADD CONSTRAINT "audience_demographics_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
