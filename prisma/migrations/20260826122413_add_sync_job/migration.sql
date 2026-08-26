-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" SERIAL NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL,
    "channelsTotal" INTEGER NOT NULL DEFAULT 0,
    "channelsSucceeded" INTEGER NOT NULL DEFAULT 0,
    "channelsFailed" INTEGER NOT NULL DEFAULT 0,
    "postsAdded" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);
