import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export function budgetPeriods(now: Date): Array<{period: string; start: Date; end: Date}> {
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  return [
    {period: 'day', start: new Date(Date.UTC(y,m,d)), end: new Date(Date.UTC(y,m,d+1))},
    {period: 'month', start: new Date(Date.UTC(y,m,1)), end: new Date(Date.UTC(y,m+1,1))},
  ];
}
export function parseBudget(value: unknown): Prisma.Decimal | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{1,10}(\.\d{1,10})?$/.test(value)) throw new Error('Некорректный бюджет');
  const amount = new Prisma.Decimal(value);
  if (!amount.gt(0)) throw new Error('Бюджет должен быть больше нуля');
  return amount;
}
export async function budgetSnapshot(tx: Prisma.TransactionClient, now = new Date()) {
  const settings = await tx.systemSetting.findUnique({where:{id:'global'}});
  const periods = await Promise.all(budgetPeriods(now).map(async p => {
    const where = {startedAt:{gte:p.start,lt:p.end}};
    const [sum, unknownCostCalls] = await Promise.all([
      tx.aiProviderCall.aggregate({where,_sum:{cost:true}}),
      tx.aiProviderCall.count({where:{...where,cost:null}}),
    ]);
    const budget = (p.period === 'day' ? settings?.aiDailyBudget : settings?.aiMonthlyBudget) ?? null;
    const cost = sum._sum.cost ?? new Prisma.Decimal(0);
    return {...p,budget,knownCostUsd:cost,unknownCostCalls,reached:budget !== null && cost.gte(budget)};
  }));
  return {settings,periods};
}
export async function recordBudgetNotices(tx: Prisma.TransactionClient, now = new Date()) {
  const snapshot = await budgetSnapshot(tx,now);
  for (const p of snapshot.periods) {
    if (!p.budget) continue;
    const warning = snapshot.settings?.aiBudgetWarning ?? 80;
    for (const threshold of [warning,100]) {
      if (p.knownCostUsd.mul(100).lt(p.budget.mul(threshold))) continue;
      const configuration = `${p.budget.toString()}:${warning}`;
      await tx.aiBudgetNotice.createMany({
        data:[{period:p.period,periodStart:p.start,configuration,threshold,cost:p.knownCostUsd}],skipDuplicates:true,
      });
    }
  }
  return snapshot;
}
/** Lease before network: an interrupted delivery is UNKNOWN and never blindly resent. */
export async function deliverBudgetNotices(): Promise<void> {
  const settings = await prisma.systemSetting.findUnique({where:{id:'global'}});
  if (!settings?.aiBudgetTelegram || !process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  const pending = await prisma.aiBudgetNotice.findMany({where:{delivery:'PENDING'},orderBy:{createdAt:'asc'},take:20});
  for (const notice of pending) {
    const claimed = await prisma.aiBudgetNotice.updateMany({where:{id:notice.id,delivery:'PENDING'},data:{delivery:'UNKNOWN'}});
    if (!claimed.count) continue;
    try {
      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
        method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),
        body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text:`Бюджет AI (${notice.period}, UTC): достигнут порог ${notice.threshold}%. Подтверждено ${notice.cost.toString()} USD.`}),
      });
      await prisma.aiBudgetNotice.update({where:{id:notice.id},data:{delivery:response.ok?'SENT':response.status===429||response.status>=500?'PENDING':'FAILED'}});
    } catch {
      // The persisted UNKNOWN state exposes ambiguous delivery without risking duplicates.
      const { logger } = await import('../logger');
      logger.warn('AI budget notification delivery outcome unknown',{noticeId:notice.id});
    }
  }
}
