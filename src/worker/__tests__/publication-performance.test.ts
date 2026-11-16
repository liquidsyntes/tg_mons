import {it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({upsert:vi.fn(),findMany:vi.fn(),update:vi.fn(),client:vi.fn(),fetch:vi.fn(),resolve:vi.fn()}));
vi.mock('../../lib/prisma',()=>({prisma:{postPerformanceCheckpoint:{upsert:mocks.upsert},post:{findMany:mocks.findMany,update:mocks.update}}}));
vi.mock('../client',()=>({getTelegramClient:mocks.client}));
vi.mock('../fetcher',()=>({fetchChannelMessages:mocks.fetch,resolveChannelEntity:mocks.resolve}));
import {savePerformanceCheckpoints,runPublicationPerformanceCycle} from '../publication-performance';
beforeEach(()=>{vi.clearAllMocks();});
it('uses the unique checkpoint key without overwriting an existing observation',async()=>{
 const pub=new Date('2026-11-10T00:00:00Z');
 await savePerformanceCheckpoints(1,pub,0,new Date('2026-11-11T01:00:00Z'));
 expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({where:{postId_hoursAfterPost:{postId:1,hoursAfterPost:24}},update:{},create:expect.objectContaining({views:0})}));
 mocks.upsert.mockClear();await savePerformanceCheckpoints(1,pub,900,new Date('2026-11-12T08:00:00Z'));expect(mocks.upsert).not.toHaveBeenCalled();
});
it('does not mark a post deleted on a network failure',async()=>{
 const now=new Date();mocks.findMany.mockResolvedValue([{id:1,channelId:2,messageId:10n,publishedAt:new Date(now.getTime()-25*3600000),publicationPlans:[{userId:1}],performanceCheckpoints:[],channel:{isActive:true,username:'test',tgId:1n,userChannels:[{userId:1}]}}]);
 mocks.client.mockResolvedValue({});mocks.resolve.mockResolvedValue({});mocks.fetch.mockRejectedValue(new Error('network'));
 await runPublicationPerformanceCycle(now);expect(mocks.update).not.toHaveBeenCalled();expect(mocks.upsert).not.toHaveBeenCalled();
});
it('collects a linked post outside the recent-message list and recognizes explicit deletion',async()=>{
 const now=new Date();const row={id:1,channelId:2,messageId:10n,publishedAt:new Date(now.getTime()-25*3600000),publicationPlans:[{userId:1}],performanceCheckpoints:[],channel:{isActive:true,username:'test',tgId:1n,userChannels:[{userId:1}]}};
 mocks.findMany.mockResolvedValue([row]);mocks.client.mockResolvedValue({});mocks.resolve.mockResolvedValue({});mocks.fetch.mockResolvedValue([{id:10,className:'Message',views:123}]);
 await runPublicationPerformanceCycle(now);expect(mocks.fetch).toHaveBeenCalledWith(expect.anything(),expect.anything(),{ids:[10]},'test');expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({postId:1,hoursAfterPost:24,views:123,source:'targeted'})}));
 mocks.fetch.mockResolvedValue([{id:10,className:'MessageEmpty'}]);await runPublicationPerformanceCycle(now);expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:1},data:expect.objectContaining({deletedAt:expect.any(Date)})}));
});
