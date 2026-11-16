import {it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({createMany:vi.fn(),runCreate:vi.fn(),runUpdate:vi.fn(),runDelete:vi.fn(),findMany:vi.fn(),update:vi.fn(),client:vi.fn(),fetch:vi.fn(),resolve:vi.fn()}));
vi.mock('../../lib/prisma',()=>({prisma:{postPerformanceCheckpoint:{createMany:mocks.createMany},publicationCollectionRun:{create:mocks.runCreate,update:mocks.runUpdate,deleteMany:mocks.runDelete},post:{findMany:mocks.findMany,update:mocks.update}}}));
vi.mock('../client',()=>({getTelegramClient:mocks.client}));
vi.mock('../fetcher',()=>({fetchChannelMessages:mocks.fetch,resolveChannelEntity:mocks.resolve}));
import {savePerformanceCheckpoints,runPublicationPerformanceCycle} from '../publication-performance';
beforeEach(()=>{vi.clearAllMocks();mocks.createMany.mockResolvedValue({count:1});mocks.runCreate.mockResolvedValue({id:"run"});});
it('uses the unique checkpoint key without overwriting an existing observation',async()=>{
 const pub=new Date('2026-11-10T00:00:00Z');
 await savePerformanceCheckpoints(1,pub,0,new Date('2026-11-11T01:00:00Z'));
 expect(mocks.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({postId:1,hoursAfterPost:24,views:0})],skipDuplicates:true});
 mocks.createMany.mockClear();await savePerformanceCheckpoints(1,pub,900,new Date('2026-11-12T08:00:00Z'));expect(mocks.createMany).not.toHaveBeenCalled();
});
it('does not mark a post deleted on a network failure',async()=>{
 const now=new Date();mocks.findMany.mockResolvedValue([{id:1,channelId:2,messageId:10n,publishedAt:new Date(now.getTime()-25*3600000),publicationPlans:[{userId:1}],performanceCheckpoints:[],channel:{isActive:true,username:'test',tgId:1n,userChannels:[{userId:1}]}}]);
 mocks.client.mockResolvedValue({});mocks.resolve.mockResolvedValue({});mocks.fetch.mockRejectedValue(new Error('network'));
 await runPublicationPerformanceCycle(now);expect(mocks.update).not.toHaveBeenCalled();expect(mocks.createMany).not.toHaveBeenCalled();
});
it('collects a linked post outside the recent-message list and recognizes explicit deletion',async()=>{
 const now=new Date();const row={id:1,channelId:2,messageId:10n,publishedAt:new Date(now.getTime()-25*3600000),publicationPlans:[{userId:1}],performanceCheckpoints:[],channel:{isActive:true,username:'test',tgId:1n,userChannels:[{userId:1}]}};
 mocks.findMany.mockResolvedValue([row]);mocks.client.mockResolvedValue({});mocks.resolve.mockResolvedValue({});mocks.fetch.mockResolvedValue([{id:10,className:'Message',views:123}]);
 await runPublicationPerformanceCycle(now);expect(mocks.fetch).toHaveBeenCalledWith(expect.anything(),expect.anything(),{ids:[10]},'test');expect(mocks.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({postId:1,hoursAfterPost:24,views:123,source:'targeted'})],skipDuplicates:true});
 mocks.fetch.mockResolvedValue([{id:10,className:'MessageEmpty'}]);await runPublicationPerformanceCycle(now);expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:1},data:expect.objectContaining({deletedAt:expect.any(Date)})}));
});

it('persists an empty run without contacting Telegram',async()=>{
 mocks.findMany.mockResolvedValue([]);await runPublicationPerformanceCycle();
 expect(mocks.client).not.toHaveBeenCalled();
 expect(mocks.runUpdate).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:'COMPLETED',candidates:0,saved:0})}));
});
it('keeps missing responses distinct from deletion',async()=>{
 const now=new Date();mocks.findMany.mockResolvedValue([{id:1,channelId:2,messageId:10n,publishedAt:new Date(now.getTime()-49*3600000),publicationPlans:[{userId:1}],performanceCheckpoints:[],channel:{isActive:true,username:'test',userChannels:[{userId:1}]}}]);
 mocks.fetch.mockResolvedValue([]);await runPublicationPerformanceCycle(now);
 expect(mocks.update).not.toHaveBeenCalled();
 expect(mocks.runUpdate).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({noResponse:1,status:'PARTIAL'})}));
});
it('applies the cap after access filtering and records overflow',async()=>{
 const now=new Date();const row={channelId:2,publishedAt:new Date(now.getTime()-25*3600000),publicationPlans:[{userId:1}],performanceCheckpoints:[],channel:{isActive:true,username:'test',userChannels:[{userId:1}]}};
 mocks.findMany.mockResolvedValue([{...row,id:9999,messageId:9999n,channel:{...row.channel,isActive:false}},...Array.from({length:501},(_,i)=>({...row,id:i+1,messageId:BigInt(i+1)}))]);
 mocks.fetch.mockImplementation(async (_client,_entity,options:{ids:number[]})=>options.ids.map(id=>({id,className:'Message',views:0})));
 await runPublicationPerformanceCycle(now);
 expect(mocks.fetch).toHaveBeenCalledTimes(5);
 expect(mocks.runUpdate).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({candidates:501,limited:1,processed:500,saved:500,status:'PARTIAL'})}));
});
it('counts only inserts and isolates diagnostic storage failure',async()=>{
 const now=new Date();mocks.createMany.mockResolvedValue({count:0});
 expect(await savePerformanceCheckpoints(1,new Date(now.getTime()-49*3600000),0,now)).toBe(0);
 mocks.runCreate.mockRejectedValueOnce(new Error('storage failure'));mocks.findMany.mockResolvedValue([]);
 await runPublicationPerformanceCycle(now);expect(mocks.findMany).toHaveBeenCalled();
});
