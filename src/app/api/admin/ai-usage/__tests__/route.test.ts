import {it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const auth=vi.hoisted(()=>vi.fn());
const db=vi.hoisted(()=>({transaction:vi.fn(),save:vi.fn()}));
vi.mock('@/lib/auth',()=>({verifyBearerToken:auth}));
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:db.transaction}}));
vi.mock('@/lib/ai-operations/budget',async original=>({...await original<typeof import('@/lib/ai-operations/budget')>(),recordBudgetNotices:vi.fn().mockResolvedValue({})}));
import {GET,POST} from '../route';
it('denies usage and limit administration to ordinary users before DB access',async()=>{
 auth.mockResolvedValue({authorized:true,userId:1,role:'USER'});
 expect((await GET(new NextRequest('http://localhost/api/admin/ai-usage'))).status).toBe(403);
 expect((await POST(new NextRequest('http://localhost/api/admin/ai-usage',{method:'POST',body:'{}'}))).status).toBe(403);
});
it('validates limit and pagination boundaries',async()=>{
 auth.mockResolvedValue({authorized:true,userId:1,role:'ADMIN'});
 expect((await GET(new NextRequest('http://localhost/api/admin/ai-usage?days=0'))).status).toBe(400);
 expect((await POST(new NextRequest('http://localhost/api/admin/ai-usage',{method:'POST',body:JSON.stringify({aiHourlyLimit:0,aiConcurrentLimit:0,aiProviderConcurrency:0})}))).status).toBe(400);
});

it('validates budgets before storage and preserves absent budget settings for old clients',async()=>{
 auth.mockResolvedValue({authorized:true,userId:1,role:'ADMIN'});
 const base={aiHourlyLimit:0,aiConcurrentLimit:0,aiProviderConcurrency:4};
 for(const extra of [{aiDailyBudget:0.1},{aiMonthlyBudget:'0'},{aiBudgetWarning:100},{aiBudgetMode:'invalid'},{aiBudgetTelegram:'true'}]) {
  expect((await POST(new NextRequest('http://localhost/api/admin/ai-usage',{method:'POST',body:JSON.stringify({...base,...extra})}))).status).toBe(400);
 }
 db.transaction.mockImplementation(async callback=>callback({$executeRaw:vi.fn(),systemSetting:{upsert:db.save}}));
 expect((await POST(new NextRequest('http://localhost/api/admin/ai-usage',{method:'POST',body:JSON.stringify(base)}))).status).toBe(200);
 expect(db.save).toHaveBeenLastCalledWith({where:{id:'global'},create:{id:'global',...base},update:base});
 expect((await POST(new NextRequest('http://localhost/api/admin/ai-usage',{method:'POST',body:JSON.stringify({...base,aiDailyBudget:'0.1',aiMonthlyBudget:null,aiBudgetMode:'BLOCK'})}))).status).toBe(200);
 expect(db.save).toHaveBeenLastCalledWith(expect.objectContaining({update:expect.objectContaining({aiMonthlyBudget:null,aiBudgetMode:'BLOCK'})}));
});
