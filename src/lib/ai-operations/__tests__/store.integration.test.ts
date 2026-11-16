import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { reserveOperation, canonicalHash, operationContext, trackedProviderFetch } from '../store';
const enabled=process.env.AI_OPERATIONS_INTEGRATION==='1';
if (enabled && !new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_ai87_test')) throw new Error('Dedicated test database required');
describe.skipIf(!enabled)('AI admission with real PostgreSQL',()=>{
  beforeEach(async()=>{
    await prisma.aiProviderCall.deleteMany();await prisma.aiOperation.deleteMany();
    await prisma.systemSetting.upsert({where:{id:'global'},create:{id:'global'},update:{aiHourlyLimit:0,aiConcurrentLimit:0,aiProviderConcurrency:4}});
    vi.restoreAllMocks();
  });
  afterAll(async()=>{if(enabled)await prisma.$disconnect();});
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
