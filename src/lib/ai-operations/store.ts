import { logger } from '../logger';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export const operationContext = new AsyncLocalStorage<{id: string; reportSaveFailed?: boolean}>();
export class AiOperationError extends Error {
  constructor(message: string, public status: number, public retryAfter?: number) { super(message); }
}
export function canonicalHash(value: unknown): string {
  function normalize(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalize(v)]));
    return item;
  }
  return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
}
// Shared DB transaction lock serializes admission across web processes, never provider I/O.
export async function reserveOperation(actor: string, userId: number | null, kind: string, key: string, requestHash: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(870001)`;
    const now = new Date();
    await tx.aiOperation.updateMany({where:{status:{not:'RUNNING'},createdAt:{lt:new Date(now.getTime()-7*86400000)},response:{not:Prisma.DbNull}},data:{response:Prisma.DbNull}});
    await tx.aiOperation.updateMany({where:{status:'RUNNING',expiresAt:{lte:now}},data:{status:'UNKNOWN'}});
    const existing = await tx.aiOperation.findUnique({where:{actor_kind_key:{actor,kind,key}}});
    if (existing) {
      if (existing.requestHash !== requestHash) throw new AiOperationError('Ключ операции уже использован с другими параметрами',409);
      return {operation:existing,created:false};
    }
    const active = await tx.aiOperation.findFirst({where:{status:'RUNNING',...(kind==='events-scan'?{kind}:{actor,kind,requestHash})}});
    if (active) {
      if (active.actor !== actor) throw new AiOperationError('Сканирование уже выполняется',429,10);
      return {operation:active,created:false};
    }
    const settings = await tx.systemSetting.findUnique({where:{id:'global'}});
    const hourly = settings?.aiHourlyLimit ?? 0, concurrent = settings?.aiConcurrentLimit ?? 0;
    if (hourly > 0 && await tx.aiOperation.count({where:{actor,createdAt:{gte:new Date(now.getTime()-3600000)}}}) >= hourly) throw new AiOperationError('Достигнут часовой лимит AI-операций',429,3600);
    if (concurrent > 0 && await tx.aiOperation.count({where:{actor,status:'RUNNING'}}) >= concurrent) throw new AiOperationError('Достигнут лимит одновременных AI-операций',429,10);
    const operation = await tx.aiOperation.create({data:{actor,userId,kind,key,requestHash,expiresAt:new Date(now.getTime()+120000)}});
    return {operation,created:true};
  });
}
export function parseUsage(body: unknown): {inputTokens: number | null; outputTokens: number | null; cost: Prisma.Decimal | null; currency: string | null; providerRequestId: string | null} {
  const data = body && typeof body==='object' ? body as Record<string,unknown> : {};
  const usage = data.usage && typeof data.usage==='object' ? data.usage as Record<string,unknown> : {};
  const token = (v: unknown) => typeof v==='number' && Number.isSafeInteger(v) && v>=0 && v<=2147483647 ? v : null;
  const cost = typeof usage.cost==='number' && Number.isFinite(usage.cost) && usage.cost>=0 ? new Prisma.Decimal(usage.cost) : null;
  return {inputTokens:token(usage.prompt_tokens ?? usage.input_tokens),outputTokens:token(usage.completion_tokens ?? usage.output_tokens),cost,currency:cost===null?null:'USD',providerRequestId:typeof data.id==='string'?data.id.slice(0,200):null};
}

/** Each HTTP attempt is admitted and recorded separately. No retry is performed here. */
export async function trackedProviderFetch(model: string, stage: string, url: string, init: RequestInit): Promise<Response> {
  const context = operationContext.getStore();
  if (!context) throw new AiOperationError('Отсутствует контекст AI-операции',503);
  const started = Date.now();
  const call = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(870001)`;
    const now = new Date();
    await tx.aiProviderCall.updateMany({where:{status:'RUNNING',expiresAt:{lte:now}},data:{status:'UNKNOWN',endedAt:now}});
    const operation = await tx.aiOperation.findUnique({where:{id:context.id}});
    if (!operation || operation.status!=='RUNNING' || operation.expiresAt<=now) throw new AiOperationError('Операция больше не активна',409);
    const settings = await tx.systemSetting.findUnique({where:{id:'global'}});
    const limit = settings?.aiProviderConcurrency ?? 4;
    if (await tx.aiProviderCall.count({where:{status:'RUNNING'}})>=limit) throw new AiOperationError('Достигнут лимит запросов провайдеру',429,5);
    return tx.aiProviderCall.create({data:{operationId:context.id,model,stage,expiresAt:new Date(now.getTime()+180000)}});
  });
  try {
    const response = await fetch(url,init);
    // Consume the body before clearing the caller's timeout or recording completion.
    const text = await response.text();
    let body: unknown = null;
    try { body=JSON.parse(text); } catch { /* Non-JSON error response has no confirmed usage. */ }
    await prisma.aiProviderCall.update({where:{id:call.id},data:{status:response.ok?'SUCCEEDED':'FAILED',endedAt:new Date(),durationMs:Date.now()-started,...parseUsage(body),model:body && typeof body==='object' && 'model' in body && typeof body.model==='string' ? body.model.slice(0,200) : model,errorCode:response.ok?null:`HTTP_${response.status}`}});
    return new Response(text,{status:response.status,headers:response.headers});
  } catch (error) {
    await prisma.aiProviderCall.updateMany({where:{id:call.id,status:'RUNNING'},data:{status:'UNKNOWN',endedAt:new Date(),durationMs:Date.now()-started,errorCode:'OUTCOME_UNKNOWN'}}).catch(()=>logger.error('AI provider journal finalization unavailable',{callId:call.id}));
    throw error;
  }
}
