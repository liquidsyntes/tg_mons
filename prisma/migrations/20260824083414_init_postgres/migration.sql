-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateTable
CREATE TABLE "channels" (
    "id" SERIAL NOT NULL,
    "username" TEXT,
    "tgId" BIGINT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isMine" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageId" BIGINT,
    "lastError" TEXT,
    "lastCollectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_reports" (
    "id" SERIAL NOT NULL,
    "channel_id" INTEGER,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshots" (
    "id" SERIAL NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "members_count" INTEGER NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "message_id" BIGINT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "views" INTEGER,
    "text" TEXT,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channels_username_key" ON "channels"("username");

-- CreateIndex
CREATE UNIQUE INDEX "channels_tgId_key" ON "channels"("tgId");

-- CreateIndex
CREATE INDEX "ai_reports_channel_id_created_at_idx" ON "ai_reports"("channel_id", "created_at");

-- CreateIndex
CREATE INDEX "snapshots_channel_id_collected_at_idx" ON "snapshots"("channel_id", "collected_at");

-- CreateIndex
CREATE INDEX "posts_channel_id_published_at_idx" ON "posts"("channel_id", "published_at");

-- CreateIndex
CREATE INDEX "posts_text_idx" ON "posts" USING GIN ("text" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "posts_channel_id_message_id_key" ON "posts"("channel_id", "message_id");

-- AddForeignKey
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
