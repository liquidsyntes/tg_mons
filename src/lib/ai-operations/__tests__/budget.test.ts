import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { budgetPeriods, parseBudget, budgetSnapshot, recordBudgetNotices } from '../budget';

function database(cost: string, unknown = 0, budget: string | null = '0.3') {
  const notice = vi.fn().mockResolvedValue({});
  const tx = {
    systemSetting:{findUnique:vi.fn().mockResolvedValue({aiDailyBudget:budget===null?null:new Prisma.Decimal(budget),aiMonthlyBudget:null,aiBudgetWarning:80})},
    aiProviderCall:{aggregate:vi.fn().mockResolvedValue({_sum:{cost:new Prisma.Decimal(cost)}}),count:vi.fn().mockResolvedValue(unknown)},
    aiBudgetNotice:{createMany:notice},
  };
  // Only the database methods used by these pure aggregation scenarios are mocked.
  return {tx:tx as unknown as Prisma.TransactionClient,notice,aggregate:tx.aiProviderCall.aggregate};
}
describe('AI budget calendar and decimal policy',()=>{
  it('uses exclusive UTC day/month boundaries across years and leap days',()=>{
    expect(budgetPeriods(new Date('2026-12-31T23:59:59Z')).map(p=>[p.start.toISOString(),p.end.toISOString()])).toEqual([
      ['2026-12-31T00:00:00.000Z','2027-01-01T00:00:00.000Z'],['2026-12-01T00:00:00.000Z','2027-01-01T00:00:00.000Z'],
    ]);
    expect(budgetPeriods(new Date('2028-02-29T00:00:00Z'))[0].end.toISOString()).toBe('2028-03-01T00:00:00.000Z');
  });
  it('accepts disabled and exact decimal amounts, rejects invalid precision and zero',()=>{
    expect(parseBudget(null)).toBeNull();expect(parseBudget('0.0000000001')?.toString()).toBe('1e-10');
    for(const value of [0,'0','-1','NaN','1e3','0.00000000001','10000000000']) expect(()=>parseBudget(value)).toThrow();
  });
  it('counts unknown separately and treats exact equality as reached',async()=>{
    const {tx,aggregate}=database('0.3',2);
    const result=await budgetSnapshot(tx,new Date('2026-11-17T12:00:00Z'));
    expect(result.periods[0]).toMatchObject({reached:true,unknownCostCalls:2});
    expect(aggregate).toHaveBeenCalledWith(expect.objectContaining({where:{startedAt:{gte:new Date('2026-11-17Z'),lt:new Date('2026-11-18Z')}}}));
    expect(result.periods[1].reached).toBe(false);
  });
  it('records both crossed thresholds and uses a stable persistent identity',async()=>{
    const {tx,notice}=database('0.3');await recordBudgetNotices(tx);await recordBudgetNotices(tx);
    expect(notice).toHaveBeenCalledTimes(4);
    expect(notice.mock.calls[0][0].data).toEqual(notice.mock.calls[2][0].data);
    expect(notice.mock.calls[1][0].data[0].threshold).toBe(100);
  });
  it('does not notify for disabled budgets or below warning',async()=>{
    const disabled=database('100',4,null);await recordBudgetNotices(disabled.tx);expect(disabled.notice).not.toHaveBeenCalled();
    const below=database('0.2399999999');await recordBudgetNotices(below.tx);expect(below.notice).not.toHaveBeenCalled();
  });
});
