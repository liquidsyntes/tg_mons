-- CreateTable
CREATE TABLE "post_snapshots" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "views" INTEGER NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_snapshots_post_id_collected_at_idx" ON "post_snapshots"("post_id", "collected_at");

-- AddForeignKey
ALTER TABLE "post_snapshots" ADD CONSTRAINT "post_snapshots_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
