-- CreateTable
CREATE TABLE "user_saved_posts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "post_id" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_saved_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_saved_posts_user_id_created_at_idx" ON "user_saved_posts"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_saved_posts_user_id_post_id_key" ON "user_saved_posts"("user_id", "post_id");

-- AddForeignKey
ALTER TABLE "user_saved_posts" ADD CONSTRAINT "user_saved_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_saved_posts" ADD CONSTRAINT "user_saved_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
