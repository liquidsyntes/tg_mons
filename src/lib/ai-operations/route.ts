import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { verifyBearerToken } from '../auth';
import { prisma } from '../prisma';
import { logger } from '../logger';
import { AiOperationError, canonicalHash, operationContext, reserveOperation } from './store';

export async function checkOperationAccess(userId: number | null, body: Record<string,unknown>): Promise<boolean> {
  if (userId===null) return true;
  const channelIds = [body.channelId,body.myChannelId,body.competitorChannelId, body.channelId1, body.channelId2].filter(v=>v!==undefined).map(Number);
  for (const id of channelIds) {
    if (!Number.isSafeInteger(id) || id<=0 || !await prisma.userChannel.findUnique({where:{userId_channelId:{userId,channelId:id}}})) return false;
  }
  for (const id of [body.reportId,body.reportId1,body.reportId2].filter(v=>v!==undefined).map(Number)) {
    if (!Number.isSafeInteger(id) || !await prisma.aiReport.findFirst({where:{id,userId}})) return false;
  }
  return true;
}
export function withAiOperation(kind: string, handler: (request: NextRequest)=>Promise<Response>) {
  return async (request: NextRequest): Promise<Response> => {
    const auth = await verifyBearerToken(request);
    if (!auth.authorized) return auth.response;
    try {
      const raw = await request.clone().text();
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) return NextResponse.json({error:'Некорректные параметры'}, {status:400});
      const body = parsed as Record<string,unknown>;
      if (!await checkOperationAccess(auth.userId,body)) return NextResponse.json({error:'Нет доступа к исходным данным'}, {status:403});
      if(kind==='persona' && auth.role!=='ADMIN') return NextResponse.json({error:'Доступно только администратору'},{status:403});
      const access = auth.userId === null ? [] : await prisma.userChannel.findMany({where:{userId:auth.userId},select:{channelId:true,isActive:true,isMine:true},orderBy:{channelId:'asc'}});
      const actor = auth.userId!==null ? `user:${auth.userId}` : request.headers.has('authorization') ? 'system:bearer' : 'admin:master';
      const supplied = request.headers.get('Idempotency-Key');
      if (supplied!==null && !/^[a-zA-Z0-9_-]{8,128}$/.test(supplied)) return NextResponse.json({error:'Некорректный ключ операции'}, {status:400});
      const {operation,created} = await reserveOperation(actor,auth.userId,kind,supplied ?? randomUUID(),canonicalHash({body,access,role:auth.role}));
      const headers = {'X-AI-Operation-Id':operation.id,'X-AI-Operation-Key':operation.key,'X-AI-Operation-State':operation.status};
      if (!created) {
        if (operation.status==='RUNNING') return NextResponse.json({operationId:operation.id,status:'RUNNING'}, {status:202,headers:{...headers,'Retry-After':'2'}});
        if (operation.status==='UNKNOWN') return NextResponse.json({operationId:operation.id,error:'Исход операции неизвестен. Автоматический повтор не выполняется.'},{status:409,headers});
        if(operation.response===null) return NextResponse.json({error:'Срок хранения результата истёк. Новая генерация требует нового ключа.'},{status:410,headers});
        return NextResponse.json(operation.response,{status:operation.httpStatus ?? 500,headers});
      }
      const heartbeat = setInterval(()=>{
        void prisma.aiOperation.updateMany({where:{id:operation.id,status:'RUNNING'},data:{expiresAt:new Date(Date.now()+120000)}}).catch(()=>logger.error('AI operation heartbeat unavailable',{operationId:operation.id}));
      },30000);
      try {
        return await operationContext.run({id:operation.id},async()=>{
          const response = await handler(request);
          if(operationContext.getStore()?.reportSaveFailed) response.headers.set('X-AI-Report-Saved','false');
          const text = await response.clone().text();
          let result: Prisma.InputJsonValue;
          try { result=JSON.parse(text) as Prisma.InputJsonValue; } catch { result={error:'Некорректный ответ операции'}; }
          const uncertain = await prisma.aiProviderCall.count({where:{operationId:operation.id,status:{in:['UNKNOWN','RUNNING']}}});
          const finalized = await prisma.aiOperation.updateMany({where:{id:operation.id,status:'RUNNING'},data:{status:uncertain?'UNKNOWN':response.ok?'SUCCEEDED':'FAILED',httpStatus:response.status,response:result}});
          if(finalized.count!==1) throw new AiOperationError('Исход операции больше не подтверждён. Повторная генерация не запущена.',409);
          response.headers.set('X-AI-Operation-Id',operation.id);
          response.headers.set('X-AI-Operation-State',uncertain?'UNKNOWN':response.ok?'SUCCEEDED':'FAILED');
          return response;
        });
      } catch (error) {
        await prisma.aiOperation.updateMany({where:{id:operation.id,status:'RUNNING'},data:{status:'UNKNOWN'}}).catch(()=>logger.error('AI operation finalization unavailable',{operationId:operation.id}));
        throw error;
      } finally { clearInterval(heartbeat); }
    } catch (error) {
      if (error instanceof SyntaxError) return NextResponse.json({error:'Некорректный JSON'},{status:400});
      if (error instanceof AiOperationError) return NextResponse.json({error:error.message},{status:error.status,headers:error.retryAfter?{'Retry-After':String(error.retryAfter)}:undefined});
      logger.error('AI operation unavailable');
      return NextResponse.json({error:'Не удалось подтвердить состояние AI-операции. Повторная генерация не запущена.'},{status:503});
    }
  };
}
