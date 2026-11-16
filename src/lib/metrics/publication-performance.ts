export const PERFORMANCE_HOURS = [24,48] as const;
export const PERFORMANCE_TOLERANCE_HOURS = 2;
export interface PerformanceSample {views:number;capturedAt:Date}
export interface PerformancePost {
  id:number;channelId:number;publishedAt:Date;deletedAt:Date|null;contentType:string;isAd:boolean;
  performanceCheckpoints:Array<PerformanceSample & {hoursAfterPost:number}>;
  snapshots:Array<{views:number;collectedAt:Date}>;
}
export interface PerformancePoint {
  hours:number;state:'pending'|'measured'|'missed'|'deleted';views:number|null;
  capturedAt:string|null;actualAgeHours:number|null;median:number|null;sampleSize:number;
  delta:number|null;deltaPercent:number|null;
}
export function checkpointHours(publishedAt:Date,capturedAt:Date): number[] {
  const age=(capturedAt.getTime()-publishedAt.getTime())/3600000;
  return PERFORMANCE_HOURS.filter(h=>age>=h&&age<=h+PERFORMANCE_TOLERANCE_HOURS);
}
export function selectPerformanceSample(post:PerformancePost,hours:number): PerformanceSample|null {
  const persisted=post.performanceCheckpoints.filter(p=>p.hoursAfterPost===hours&&Number.isFinite(p.views)&&p.views>=0&&checkpointHours(post.publishedAt,p.capturedAt).includes(hours));
  const candidates=persisted.length?persisted:post.snapshots.map(s=>({views:s.views,capturedAt:s.collectedAt}));
  return candidates.filter(s=>Number.isFinite(s.views)&&s.views>=0&&checkpointHours(post.publishedAt,s.capturedAt).includes(hours)).sort((a,b)=>a.capturedAt.getTime()-b.capturedAt.getTime())[0]??null;
}
export function publicationPerformance(post:PerformancePost,cohort:readonly PerformancePost[],now=new Date()):PerformancePoint[] {
  return PERFORMANCE_HOURS.map(hours=>{
    const sample=selectPerformanceSample(post,hours);
    const peers=cohort.filter(p=>p.id!==post.id&&p.channelId===post.channelId&&p.contentType===post.contentType&&p.isAd===post.isAd&&p.publishedAt<post.publishedAt&&p.publishedAt.getTime()>=post.publishedAt.getTime()-30*86400000);
    const values=peers.flatMap(p=>{const s=selectPerformanceSample(p,hours);return s?[s.views]:[];}).sort((a,b)=>a-b);
    const median=values.length>=5?(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2:null;
    const delta=sample&&median!==null?sample.views-median:null;
    const age=(now.getTime()-post.publishedAt.getTime())/3600000;
    return {hours,state:sample?'measured':post.deletedAt?'deleted':age<=hours+2?'pending':'missed',views:sample?.views??null,capturedAt:sample?.capturedAt.toISOString()??null,actualAgeHours:sample?(sample.capturedAt.getTime()-post.publishedAt.getTime())/3600000:null,median,sampleSize:values.length,delta,deltaPercent:delta!==null&&median!==null&&median>0?delta/median*100:null};
  });
}
