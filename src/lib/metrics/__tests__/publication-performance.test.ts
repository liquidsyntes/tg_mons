import {it,expect} from 'vitest';
import {checkpointHours,publicationPerformance,selectPerformanceSample,type PerformancePost} from '../publication-performance';
const date=new Date('2026-11-10T12:00:00Z');
function post(id=1,views=100):PerformancePost{return {id,channelId:1,publishedAt:date,deletedAt:null,contentType:'text',isAd:false,performanceCheckpoints:[{hoursAfterPost:24,views,capturedAt:new Date(date.getTime()+24.5*3600000)}],snapshots:[]};}
it('accepts only post-age windows, including boundaries and zero views',()=>{
 expect(checkpointHours(date,new Date(date.getTime()+24*3600000))).toEqual([24]);
 expect(checkpointHours(date,new Date(date.getTime()+26*3600000))).toEqual([24]);
 expect(checkpointHours(date,new Date(date.getTime()+26*3600000+1))).toEqual([]);
 expect(checkpointHours(date,new Date(date.getTime()+48*3600000))).toEqual([48]);
 expect(selectPerformanceSample(post(1,0),24)?.views).toBe(0);
 expect(selectPerformanceSample(post(),48)).toBeNull();
});
it('uses only earlier matching posts with same-age samples, excluding self and future',()=>{
 const target=post(1,200);
 const peers=Array.from({length:5},(_,i)=>{const p=post(i+2,100);p.publishedAt=new Date(date.getTime()-(i+1)*86400000);p.performanceCheckpoints[0].capturedAt=new Date(p.publishedAt.getTime()+25*3600000);return p;});
 const result=publicationPerformance(target,[target,...peers,{...post(90,9000),isAd:true}],new Date(date.getTime()+60*3600000));
 expect(result[0]).toMatchObject({views:200,median:100,sampleSize:5,delta:100,deltaPercent:100});
 expect(result[1]).toMatchObject({state:'missed',views:null,median:null});
 expect(publicationPerformance(target,peers.slice(0,4))[0].median).toBeNull();
});
it('preserves stable checkpoints and distinguishes pending, missed and deleted',()=>{
 const p=post();p.snapshots=[{views:50,collectedAt:new Date(date.getTime()+24*3600000)}];
 expect(selectPerformanceSample(p,24)?.views).toBe(100);
 expect(publicationPerformance(p,[],new Date(date.getTime()+48*3600000))[1].state).toBe('pending');
 p.deletedAt=new Date();
 expect(publicationPerformance(p,[])[0].state).toBe('measured');
 expect(publicationPerformance(p,[])[1].state).toBe('deleted');
});
it('keeps zero baseline distinct from unavailable data',()=>{
 const target=post(1,10);
 const peers=Array.from({length:5},(_,i)=>{const p=post(i+2,0);p.publishedAt=new Date(date.getTime()-(i+1)*86400000);p.performanceCheckpoints[0].capturedAt=new Date(p.publishedAt.getTime()+24*3600000);return p;});
 expect(publicationPerformance(target,peers)[0]).toMatchObject({median:0,delta:10,deltaPercent:null,sampleSize:5});
});
