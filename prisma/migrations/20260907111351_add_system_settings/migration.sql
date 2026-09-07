-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "ai_provider" TEXT NOT NULL DEFAULT 'openrouter',
    "ai_model" TEXT NOT NULL DEFAULT 'meta-llama/llama-3.1-8b-instruct:free',
    "ai_token" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);
