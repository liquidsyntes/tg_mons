import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  const auth=await verifyBearerToken(req);
  if (!auth.authorized) return auth.response;
  if (auth.role!=='ADMIN') return NextResponse.json({error:'Доступно только администратору'},{status:403});
  const params=req.nextUrl.searchParams;
  const days=Number(params.get('days') ?? 7), page=Number(params.get('page') ?? 0);
  if (!Number.isInteger(days)||days<1||days>90||!Number.isInteger(page)||page<0||page>10000) return NextResponse.json({error:'Некорректный период или страница'},{status:400});
  const where: Prisma.AiOperationWhereInput={createdAt:{gte:new Date(Date.now()-days*86400000)},...(params.get('actor')?{actor:params.get('actor')!}:{}),...(params.get('kind')?{kind:params.get('kind')!}:{})};
  try {
    const [operations,total,cost,known,calls,settings]=await Promise.all([
      prisma.aiOperation.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:page*25,take:25,select:{id:true,actor:true,kind:true,status:true,createdAt:true,updatedAt:true,calls:{select:{model:true,stage:true,status:true,durationMs:true,inputTokens:true,outputTokens:true,cost:true,currency:true}}}}),
      prisma.aiOperation.count({where}),
      prisma.aiProviderCall.aggregate({where:{operation:where},_sum:{cost:true,inputTokens:true,outputTokens:true}}),
      prisma.aiProviderCall.count({where:{operation:where,cost:{not:null}}}),
      prisma.aiProviderCall.count({where:{operation:where}}),
      prisma.systemSetting.findUnique({where:{id:'global'},select:{aiHourlyLimit:true,aiConcurrentLimit:true,aiProviderConcurrency:true}}),
    ]);
    return NextResponse.json({operations,total,page,summary:{knownCostUsd:cost._sum.cost,unknownCostCalls:calls-known,calls,inputTokens:cost._sum.inputTokens,outputTokens:cost._sum.outputTokens},settings:settings??{aiHourlyLimit:0,aiConcurrentLimit:0,aiProviderConcurrency:4}});
  } catch { return NextResponse.json({error:'Не удалось загрузить использование AI'},{status:503}); }
}
export async function POST(req: NextRequest) {
  const auth=await verifyBearerToken(req);
  if (!auth.authorized) return auth.response;
  if (auth.role!=='ADMIN') return NextResponse.json({error:'Доступно только администратору'},{status:403});
  try {
    const raw: unknown=await req.json();
    if (!raw||typeof raw!=='object'||Array.isArray(raw)) return NextResponse.json({error:'Некорректные лимиты'},{status:400});
    const b=raw as Record<string,unknown>;
    const hourly=b.aiHourlyLimit, concurrent=b.aiConcurrentLimit, provider=b.aiProviderConcurrency;
    if (typeof hourly!=='number'||!Number.isInteger(hourly)||hourly<0||hourly>10000||typeof concurrent!=='number'||!Number.isInteger(concurrent)||concurrent<0||concurrent>100||typeof provider!=='number'||!Number.isInteger(provider)||provider<1||provider>32) return NextResponse.json({error:'Некорректные лимиты'},{status:400});
    const data={aiHourlyLimit:hourly,aiConcurrentLimit:concurrent,aiProviderConcurrency:provider};
    await prisma.systemSetting.upsert({where:{id:'global'},create:{id:'global',...data},update:data});
    return NextResponse.json({success:true});
  } catch { return NextResponse.json({error:'Не удалось сохранить лимиты'},{status:503}); }
}
