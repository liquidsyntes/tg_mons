import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { budgetSnapshot, recordBudgetNotices } from '../budget';
import { reserveOperation, canonicalHash, operationContext, trackedProviderFetch } from '../store';
const enabled=process.env.AI_OPERATIONS_INTEGRATION==='1';
if (enabled && !new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_ai87_test')) throw new Error('Dedicated test database required');
describe.skipIf(!enabled)('AI admission with real PostgreSQL',()=>{
  beforeEach(async()=>{
    await prisma.aiBudgetNotice.deleteMany();await prisma.aiProviderCall.deleteMany();await prisma.aiOperation.deleteMany();
    await prisma.systemSetting.upsert({where:{id:'global'},create:{id:'global'},update:{aiDailyBudget:null,aiMonthlyBudget:null,aiBudgetMode:'WARN',aiBudgetTelegram:false,aiBudgetWarning:80,aiHourlyLimit:0,aiConcurrentLimit:0,aiProviderConcurrency:4}});
    vi.restoreAllMocks();
  });
  afterAll(async()=>{if(enabled)await prisma.$disconnect();});
  it('blocks new work at exact budget, preserves replay and deduplicates notices across clients',async()=>{
    const original=await reserveOperation('user:1',1,'summary','budget-original','a');
    await prisma.aiOperation.update({where:{id:original.operation.id},data:{status:'SUCCEEDED',response:{saved:true}}});
    await prisma.aiProviderCall.create({data:{operationId:original.operation.id,model:'synthetic',stage:'chat',status:'SUCCEEDED',cost:'0.3',currency:'USD',expiresAt:new Date()}});
    await prisma.systemSetting.update({where:{id:'global'},data:{aiDailyBudget:'0.3',aiBudgetMode:'BLOCK'}});
    const results=await Promise.allSettled([reserveOperation('user:1',1,'summary','budget-new-a','b'),reserveOperation('user:2',2,'summary','budget-new-b','c')]);
    expect(results.every(r=>r.status==='rejected')).toBe(true);
    expect((await reserveOperation('user:1',1,'summary','budget-original','a')).created).toBe(false);
    await Promise.all(Array.from({length:4},()=>prisma.$transaction(tx=>recordBudgetNotices(tx))));
    expect(await prisma.aiBudgetNotice.count()).toBe(2);
    await prisma.systemSetting.update({where:{id:'global'},data:{aiBudgetMode:'WARN'}});
    expect((await reserveOperation('user:2',2,'summary','budget-warn','c')).created).toBe(true);
  });
  it('attributes late confirmed costs to call start rather than parent creation or completion',async()=>{
    const op=await reserveOperation('user:1',1,'summary','late-call','a');
    await prisma.systemSetting.update({where:{id:'global'},data:{aiDailyBudget:'0.1',aiMonthlyBudget:'0.2'}});
    await prisma.aiProviderCall.create({data:{operationId:op.operation.id,model:'synthetic',stage:'chat',status:'SUCCEEDED',startedAt:new Date('2026-12-31T23:59:59Z'),endedAt:new Date('2027-01-01T00:01:00Z'),cost:'0.2',currency:'USD',expiresAt:new Date()}});
    const previous=await prisma.$transaction(tx=>budgetSnapshot(tx,new Date('2026-12-31T23:59:59Z')));
    const next=await prisma.$transaction(tx=>budgetSnapshot(tx,new Date('2027-01-01T00:01:00Z')));
    expect(previous.periods.every(p=>p.reached)).toBe(true);
    expect(next.periods.every(p=>!p.reached && p.knownCostUsd.isZero())).toBe(true);
  });
  it('reserves exactly once from independent Node processes',async()=>{
    const run=promisify(execFile);
    const args=[resolve('node_modules/tsx/dist/cli.mjs'),resolve('src/lib/ai-operations/__tests__/admit-process.ts')];
    const responses=await Promise.all([run(process.execPath,args),run(process.execPath,args)]);
    const values=responses.map(r=>JSON.parse(r.stdout) as {created:boolean;id:string});
    expect(values.filter(v=>v.created)).toHaveLength(1);
    expect(values[0].id).toBe(values[1].id);
  },20000);
  it('admits one of concurrent identical operations and one provider dispatch',async()=>{
    const results=await Promise.all(Array.from({length:8},()=>reserveOperation('user:1',1,'summary','same-key',canonicalHash({channelId:1}))));
    expect(results.filter(r=>r.created)).toHaveLength(1);
    expect(new Set(results.map(r=>r.operation.id)).size).toBe(1);
    const fake=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({choices:[],usage:{prompt_tokens:12,completion_tokens:4,cost:0.01}})));
    await Promise.all(results.filter(r=>r.created).map(r=>operationContext.run({id:r.operation.id},()=>trackedProviderFetch('test','chat','https://example.org',{method:'POST'}))));
    expect(fake).toHaveBeenCalledTimes(1);
    expect((await prisma.aiProviderCall.findFirst())?.cost?.toString()).toBe('0.01');
  });
  it('enforces the last operation slot atomically across separate transactions',async()=>{
    await prisma.systemSetting.update({where:{id:'global'},data:{aiConcurrentLimit:1}});
    const results=await Promise.allSettled([reserveOperation('user:1',1,'summary','key-a','a'),reserveOperation('user:1',1,'summary','key-b','b')]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  });
  it('does not merge different users or reuse a key with different parameters',async()=>{
    const a=await reserveOperation('user:1',1,'summary','key-a','a');
    const b=await reserveOperation('user:2',2,'summary','key-a','a');
    expect(a.operation.id).not.toBe(b.operation.id);
    await expect(reserveOperation('user:1',1,'summary','key-a','b')).rejects.toMatchObject({status:409});
  });
  it('reconciles expired operations without dispatching again',async()=>{
    const a=await reserveOperation('user:1',1,'summary','key-a','a');
    await prisma.aiOperation.update({where:{id:a.operation.id},data:{expiresAt:new Date(0)}});
    const repeat=await reserveOperation('user:1',1,'summary','key-a','a');
    expect(repeat.created).toBe(false);expect(repeat.operation.status).toBe('UNKNOWN');
  });
  it('enforces provider slots and records unknown transport outcomes',async()=>{
    await prisma.systemSetting.update({where:{id:'global'},data:{aiProviderConcurrency:1}});
    const a=await reserveOperation('user:1',1,'summary','key-a','a');
    let release: (()=>void)|undefined;
    vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{await new Promise<void>(r=>{release=r;});throw new Error('transport');});
    const running=operationContext.run({id:a.operation.id},()=>trackedProviderFetch('test','chat','https://example.org',{})).catch(e=>e);
    for(let i=0;i<50&&!release;i++)await new Promise(r=>setTimeout(r,20));
    expect(release).toBeDefined();
    await expect(operationContext.run({id:a.operation.id},()=>trackedProviderFetch('test','chat','https://example.org',{}))).rejects.toMatchObject({status:429});
    release!();await running;
    expect((await prisma.aiProviderCall.findFirst())?.status).toBe('UNKNOWN');
  });
});
