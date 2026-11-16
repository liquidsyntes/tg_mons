-- CreateTable
CREATE TABLE "publication_collection_runs" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "candidates" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "saved" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "limited" INTEGER NOT NULL DEFAULT 0,
    "deleted" INTEGER NOT NULL DEFAULT 0,
    "noResponse" INTEGER NOT NULL DEFAULT 0,
    "invalidViews" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "publication_collection_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "publication_collection_runs_startedAt_idx" ON "publication_collection_runs"("startedAt");
