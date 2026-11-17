-- CreateEnum
CREATE TYPE "AiBudgetMode" AS ENUM ('WARN', 'BLOCK');

-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN     "aiBudgetMode" "AiBudgetMode" NOT NULL DEFAULT 'WARN',
ADD COLUMN     "aiBudgetTelegram" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiBudgetWarning" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "aiDailyBudget" DECIMAL(20,10),
ADD COLUMN     "aiMonthlyBudget" DECIMAL(20,10);

-- CreateTable
CREATE TABLE "ai_budget_notices" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "configuration" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "cost" DECIMAL(20,10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ai_budget_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_budget_notices_period_periodStart_configuration_threshol_key" ON "ai_budget_notices"("period", "periodStart", "configuration", "threshold");
