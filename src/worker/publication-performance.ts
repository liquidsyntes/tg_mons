import {prisma} from '../lib/prisma';
import {logger} from '../lib/logger';
import {checkpointHours} from '../lib/metrics/publication-performance';
import {getTelegramClient} from './client';
import {resolveChannelEntity,fetchChannelMessages} from './fetcher';

export async function savePerformanceCheckpoints(postId:number,publishedAt:Date,views:number,capturedAt=new Date(),source='collector'):Promise<void> {
  if(!Number.isSafeInteger(views)||views<0)return;
  for(const hoursAfterPost of checkpointHours(publishedAt,capturedAt)) {
    await prisma.postPerformanceCheckpoint.upsert({where:{postId_hoursAfterPost:{postId,hoursAfterPost}},create:{postId,hoursAfterPost,views,capturedAt,source},update:{}});
  }
}
/** Runs inside the existing serialized hourly task; no separate scheduler. */
export async function runPublicationPerformanceCycle(now=new Date()):Promise<void> {
  try {
    const posts=await prisma.post.findMany({
      where:{deletedAt:null,publicationPlans:{some:{}},OR:[24,48].map(hours=>({publishedAt:{gte:new Date(now.getTime()-(hours+2)*3600000),lte:new Date(now.getTime()-hours*3600000)},performanceCheckpoints:{none:{hoursAfterPost:hours}}}))},
      include:{channel:{include:{userChannels:{where:{isActive:true},select:{userId:true}}}},publicationPlans:{select:{userId:true}},performanceCheckpoints:true},
      orderBy:{publishedAt:'asc'},take:500,
    });
    const due=posts.filter(p=>p.channel.isActive&&p.publicationPlans.some(plan=>p.channel.userChannels.some(u=>u.userId===plan.userId))&&checkpointHours(p.publishedAt,now).some(h=>!p.performanceCheckpoints.some(s=>s.hoursAfterPost===h)));
    if(!due.length)return;
    const client=await getTelegramClient();
    for(const channelId of new Set(due.map(p=>p.channelId))) {
      const group=due.filter(p=>p.channelId===channelId),channel=group[0].channel;
      const identifier=channel.username??channel.tgId?.toString();if(!identifier)continue;
      try {
        const entity=await resolveChannelEntity(client,identifier);
        for(let offset=0;offset<group.length;offset+=100){
          const batch=group.slice(offset,offset+100);
          const messages=await fetchChannelMessages(client,entity,{ids:batch.map(p=>Number(p.messageId))},identifier);
          for(const post of batch){
            const msg=messages.find(m=>m.id===Number(post.messageId));
            // Only an explicit MessageEmpty proves deletion in this optional collector.
            if(isExplicitlyDeleted(msg)) {await prisma.post.update({where:{id:post.id},data:{deletedAt:new Date(),lastCheckedAt:new Date()}});continue;}
            if(msg&&'views' in msg&&typeof msg.views==='number')await savePerformanceCheckpoints(post.id,post.publishedAt,msg.views,new Date(),'targeted');
          }
        }
      } catch(error){logger.warn('Publication checkpoint collection failed',{channelId},error);}
    }
  }catch(error){logger.warn('Publication performance cycle unavailable',undefined,error);}
}

export function isExplicitlyDeleted(value:unknown):boolean { return !!value && typeof value==='object' && 'className' in value && value.className==='MessageEmpty'; }
