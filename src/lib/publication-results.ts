import {prisma} from './prisma';
import {publicationPerformance,type PerformancePoint} from './metrics/publication-performance';
export interface PublicationResult {
  state:'linked'|'unavailable'|'unlinked'|'removed';
  postId?:number;messageId?:string;channelTitle?:string;username?:string|null;publishedAt?:string;deletedAt?:string|null;
  points?:PerformancePoint[];
}
export async function loadPublicationResults(userId:number,entries:ReadonlyArray<{postId:number;publishedPostId:number|null;publicationLinkedAt:Date|null}>):Promise<Map<number,PublicationResult>> {
  const results=new Map<number,PublicationResult>();
  const ids=entries.flatMap(e=>e.publishedPostId==null?[]:[e.publishedPostId]);
  if(!ids.length){for(const e of entries)results.set(e.postId,{state:e.publicationLinkedAt?'removed':'unlinked'});return results;}
  const targets=await prisma.post.findMany({where:{id:{in:ids},channel:{isActive:true,userChannels:{some:{userId,isActive:true}}}},include:{channel:{select:{title:true,username:true}},performanceCheckpoints:true,snapshots:true}});
  const cohort=targets.length?await prisma.post.findMany({where:{OR:targets.map(p=>({channelId:p.channelId,contentType:p.contentType,isAd:p.isAd,publishedAt:{gte:new Date(p.publishedAt.getTime()-30*86400000),lt:p.publishedAt}}))},include:{performanceCheckpoints:true,snapshots:true}}):[];
  for(const e of entries){
    if(e.publishedPostId==null){results.set(e.postId,{state:e.publicationLinkedAt?'removed':'unlinked'});continue;}
    const post=targets.find(p=>p.id===e.publishedPostId);
    results.set(e.postId,post?{state:'linked',postId:post.id,messageId:post.messageId.toString(),channelTitle:post.channel.title,username:post.channel.username,publishedAt:post.publishedAt.toISOString(),deletedAt:post.deletedAt?.toISOString()??null,points:publicationPerformance(post,cohort)}:{state:'unavailable'});
  }
  return results;
}
