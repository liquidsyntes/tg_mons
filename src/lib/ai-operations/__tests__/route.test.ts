import {it,expect,vi,beforeEach} from 'vitest';
import {NextRequest,NextResponse} from 'next/server';
const mocks=vi.hoisted(()=>({auth:vi.fn(),channel:vi.fn(),channels:vi.fn(),report:vi.fn(),reserve:vi.fn(),update:vi.fn(),count:vi.fn()}));
vi.mock('@/lib/auth',()=>({verifyBearerToken:mocks.auth}));
vi.mock('@/lib/prisma',()=>({prisma:{userChannel:{findUnique:mocks.channel,findMany:mocks.channels},aiReport:{findFirst:mocks.report},aiOperation:{updateMany:mocks.update},aiProviderCall:{count:mocks.count}}}));
vi.mock('../store',async original=>({...await original<typeof import('../store')>(),reserveOperation:mocks.reserve}));
import {withAiOperation} from '../route';
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({authorized:true,userId:1,role:'USER'});mocks.channel.mockResolvedValue({});mocks.channels.mockResolvedValue([{channelId:1,isActive:true,isMine:false}]);mocks.count.mockResolvedValue(0);mocks.update.mockResolvedValue({count:1});});
const request=(body:unknown={channelId:1})=>new NextRequest('http://localhost/api/ai/summary',{method:'POST',headers:{'Idempotency-Key':'abcdefgh'},body:JSON.stringify(body)});
it('returns stored results without rerunning the handler and checks source access first',async()=>{
 const handler=vi.fn().mockResolvedValue(NextResponse.json({summary:'new'}));
 mocks.reserve.mockResolvedValue({created:false,operation:{id:'op',key:'abcdefgh',status:'SUCCEEDED',response:{summary:'saved'},httpStatus:200}});
 expect(await (await withAiOperation('summary',handler)(request())).json()).toEqual({summary:'saved'});expect(handler).not.toHaveBeenCalled();
 mocks.channel.mockResolvedValue(null);
 expect((await withAiOperation('summary',handler)(request())).status).toBe(403);
});
it('returns the original action key when joining an in-flight request',async()=>{
 mocks.reserve.mockResolvedValue({created:false,operation:{id:'op',key:'original-key',status:'RUNNING'}});
 const response=await withAiOperation('summary',vi.fn())(request());
 expect(response.status).toBe(202);expect(response.headers.get('X-AI-Operation-Key')).toBe('original-key');
});
it('does not expose another user report or allow downgraded persona replay',async()=>{
 mocks.report.mockResolvedValue(null);
 expect((await withAiOperation('action-plan',vi.fn())(request({reportId:3}))).status).toBe(403);
 expect((await withAiOperation('persona',vi.fn())(request())).status).toBe(403);
 expect(mocks.reserve).not.toHaveBeenCalled();
});
it('does not invoke handler after unknown outcomes',async()=>{
 mocks.reserve.mockResolvedValue({created:false,operation:{id:'op',key:'abcdefgh',status:'UNKNOWN'}});
 const handler=vi.fn();expect((await withAiOperation('summary',handler)(request())).status).toBe(409);expect(handler).not.toHaveBeenCalled();
});
it('stores a fresh result and refuses to claim success if its lease was lost',async()=>{
 mocks.reserve.mockResolvedValue({created:true,operation:{id:'op',key:'abcdefgh',status:'RUNNING'}});
 const handler=vi.fn().mockImplementation(async()=>NextResponse.json({summary:'new'}));
 expect((await withAiOperation('summary',handler)(request())).status).toBe(200);
 expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'SUCCEEDED',response:{summary:'new'}})}));
 mocks.update.mockResolvedValue({count:0});
 expect((await withAiOperation('summary',handler)(request())).status).toBe(409);
});
it('does not invoke a handler when admission cannot be recorded',async()=>{
 mocks.reserve.mockRejectedValue(new Error('database unavailable'));
 const handler=vi.fn();
 expect((await withAiOperation('summary',handler)(request())).status).toBe(503);
 expect(handler).not.toHaveBeenCalled();
});
