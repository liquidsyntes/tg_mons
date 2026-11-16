-- CreateEnum
CREATE TYPE "AiOperationStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN     "ai_concurrent_limit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ai_hourly_limit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ai_provider_concurrency" INTEGER NOT NULL DEFAULT 4;

-- CreateTable
CREATE TABLE "ai_operations" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "user_id" INTEGER,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" "AiOperationStatus" NOT NULL DEFAULT 'RUNNING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "response" JSONB,
    "http_status" INTEGER,

    CONSTRAINT "ai_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_calls" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" "AiOperationStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cost" DECIMAL(20,10),
    "currency" TEXT,
    "provider_request_id" TEXT,
    "error_code" TEXT,

    CONSTRAINT "ai_provider_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_operations_actor_created_at_idx" ON "ai_operations"("actor", "created_at");

-- CreateIndex
CREATE INDEX "ai_operations_status_expires_at_idx" ON "ai_operations"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_operations_actor_kind_key_key" ON "ai_operations"("actor", "kind", "key");

-- CreateIndex
CREATE INDEX "ai_provider_calls_status_expires_at_idx" ON "ai_provider_calls"("status", "expires_at");

-- CreateIndex
CREATE INDEX "ai_provider_calls_operation_id_started_at_idx" ON "ai_provider_calls"("operation_id", "started_at");

-- CreateIndex
CREATE INDEX "ai_provider_calls_started_at_model_idx" ON "ai_provider_calls"("started_at", "model");

-- AddForeignKey
ALTER TABLE "ai_provider_calls" ADD CONSTRAINT "ai_provider_calls_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "ai_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

