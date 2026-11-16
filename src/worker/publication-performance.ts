import {prisma} from '../lib/prisma';
import {logger} from '../lib/logger';
import {checkpointHours} from '../lib/metrics/publication-performance';
import {getTelegramClient} from './client';
import {resolveChannelEntity,fetchChannelMessages} from './fetcher';

export async function savePerformanceCheckpoints(postId:number,publishedAt:Date,views:number,capturedAt=new Date(),source='collector'):Promise<number> {
  if(!Number.isSafeInteger(views)||views<0)return 0;
  let saved=0;
  for(const hoursAfterPost of checkpointHours(publishedAt,capturedAt)) {
    const result=await prisma.postPerformanceCheckpoint.createMany({data:[{postId,hoursAfterPost,views,capturedAt,source}],skipDuplicates:true});
    saved+=result.count;
  }
  return saved;
}
/** Runs inside the existing serialized hourly task; no separate scheduler. */
export async function runPublicationPerformanceCycle(now=new Date()):Promise<void> {
  let runId:string|undefined;
  const counts={candidates:0,processed:0,saved:0,errors:0,limited:0,deleted:0,noResponse:0,invalidViews:0};
  const persist=async(status='RUNNING')=>{if(!runId)return;try{await prisma.publicationCollectionRun.update({where:{id:runId},data:{...counts,status,...(status==='RUNNING'?{}:{endedAt:new Date()})}});}catch{logger.warn('Publication diagnostics could not be persisted');}};
  try {
    try {await prisma.publicationCollectionRun.deleteMany({where:{startedAt:{lt:new Date(now.getTime()-30*86400000)}}});
    runId=(await prisma.publicationCollectionRun.create({data:{startedAt:now}})).id;
    }catch{logger.warn('Publication diagnostics could not be started');}
    const posts=await prisma.post.findMany({
      where:{deletedAt:null,publicationPlans:{some:{}},OR:[24,48].map(hours=>({publishedAt:{gte:new Date(now.getTime()-(hours+2)*3600000),lte:new Date(now.getTime()-hours*3600000)},performanceCheckpoints:{none:{hoursAfterPost:hours}}}))},
      select:{id:true,channelId:true,messageId:true,publishedAt:true,channel:{select:{isActive:true,username:true,tgId:true,userChannels:{where:{isActive:true},select:{userId:true}}}},publicationPlans:{select:{userId:true}},performanceCheckpoints:{select:{hoursAfterPost:true}}},
      orderBy:[{publishedAt:'asc'},{id:'asc'}],
    });
    const eligible=posts.filter(p=>p.channel.isActive&&p.publicationPlans.some(plan=>p.channel.userChannels.some(u=>u.userId===plan.userId))&&checkpointHours(p.publishedAt,now).some(h=>!p.performanceCheckpoints.some(s=>s.hoursAfterPost===h)));
    counts.candidates=eligible.length;
    const due=eligible.slice(0,500);counts.limited=Math.max(0,eligible.length-due.length);
    await persist();
    if(!due.length){await persist('COMPLETED');return;}
    const client=await getTelegramClient();
    for(const channelId of new Set(due.map(p=>p.channelId))) {
      const group=due.filter(p=>p.channelId===channelId),channel=group[0].channel;
      const identifier=channel.username??channel.tgId?.toString();if(!identifier){counts.errors+=group.length;await persist();continue;}
      try {
        const entity=await resolveChannelEntity(client,identifier);
        for(let offset=0;offset<group.length;offset+=100){
          const batch=group.slice(offset,offset+100);
          const messages=await fetchChannelMessages(client,entity,{ids:batch.map(p=>Number(p.messageId))},identifier);
          for(const post of batch){
            const msg=messages.find(m=>m.id===Number(post.messageId));
            // Only an explicit MessageEmpty proves deletion in this optional collector.
            counts.processed++;
            if(!msg){counts.noResponse++;continue;}
            if(isExplicitlyDeleted(msg)) {await prisma.post.update({where:{id:post.id},data:{deletedAt:new Date(),lastCheckedAt:new Date()}});counts.deleted++;continue;}
            if('views' in msg&&typeof msg.views==='number'&&Number.isSafeInteger(msg.views)&&msg.views>=0)counts.saved+=await savePerformanceCheckpoints(post.id,post.publishedAt,msg.views,new Date(),'targeted');
            else counts.invalidViews++;
          }
          await persist();
        }
      } catch{counts.errors++;await persist();logger.warn('Publication checkpoint collection failed',{channelId});}
    }
    await persist(counts.errors||counts.noResponse||counts.invalidViews||counts.limited?'PARTIAL':'COMPLETED');
  }catch{counts.errors++;try{await persist('FAILED');}catch{logger.warn('Publication diagnostics could not be persisted');}logger.warn('Publication performance cycle unavailable');}
}

export function isExplicitlyDeleted(value:unknown):boolean { return !!value && typeof value==='object' && 'className' in value && value.className==='MessageEmpty'; }
