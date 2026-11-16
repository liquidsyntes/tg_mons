import { expect, it, vi } from 'vitest';
vi.mock('../../prisma', () => ({ prisma: {} }));
import { summarizePublications } from '../publication-summary';
import type { PerformancePost } from '../publication-performance';
const now = new Date('2026-11-16T12:00:00Z');
function post(id: number, days: number, views = 100, isAd = false): PerformancePost {
  const publishedAt = new Date(now.getTime() - days * 86400000);
  return {id,channelId:1,publishedAt,deletedAt:null,contentType:'text',isAd,snapshots:[],performanceCheckpoints:[24,48].map(hoursAfterPost=>({hoursAfterPost,views,capturedAt:new Date(publishedAt.getTime()+hoursAfterPost*3600000)}))};
}
it('matches manual counts, deduplicates, separates ads and both windows',()=>{
 const peers=Array.from({length:5},(_,i)=>post(i+10,i+4));
 const a=post(1,3,200), b=post(2,3,100), c=post(3,3,50), ad=post(4,3,200,true);
 const result=summarizePublications([a,a,b,c,ad],peers,7,now);
 expect(result.coverage.publications).toBe(4);
 for(const w of result.groups[0].windows) expect(w).toMatchObject({measured:3,comparable:3,above:1,equal:1,below:1,withoutBaseline:0});
 expect(result.groups[1].windows[0]).toMatchObject({measured:1,comparable:0,withoutBaseline:1});
});
it('handles zero baselines and inclusive period boundaries',()=>{
 const peers=Array.from({length:5},(_,i)=>post(i+10,i+8,0));
 const result=summarizePublications([post(1,7,0),post(2,7.001)],peers,7,now);
 expect(result.coverage.publications).toBe(1);
 expect(result.groups[0].windows[0]).toMatchObject({equal:1,comparable:1});
 expect(summarizePublications([],[],7,now).groups).toEqual([]);
});
it('keeps waiting, missed and deleted points out of comparison without replacing them by zero',()=>{
 const missing={...post(1,3),performanceCheckpoints:[]};
 const deleted={...missing,id:2,deletedAt:now};
 const pending={...post(3,0.5),performanceCheckpoints:[]};
 const result=summarizePublications([missing,deleted,pending],[],7,now);
 expect(result.coverage.windows[0]).toMatchObject({missed:1,deleted:1,pending:1,denominator:1});
 expect(result.groups[0].windows[0]).toMatchObject({measured:0,comparable:0,above:0,equal:0,below:0});
});
