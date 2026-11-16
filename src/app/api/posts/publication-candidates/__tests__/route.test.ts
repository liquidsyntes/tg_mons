import {it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({auth:vi.fn(),channel:vi.fn(),posts:vi.fn()}));
vi.mock('@/lib/auth',()=>({verifyBearerToken:mocks.auth}));
vi.mock('@/lib/prisma',()=>({prisma:{userChannel:{findFirst:mocks.channel},post:{findMany:mocks.posts}}}));
import {GET} from '../route';
it('requires a personal account and validates pagination',async()=>{
 mocks.auth.mockResolvedValue({authorized:true,userId:null,role:'ADMIN'});
 expect((await GET(new NextRequest('http://localhost/api/posts/publication-candidates'))).status).toBe(403);
 mocks.auth.mockResolvedValue({authorized:true,userId:3,role:'USER'});
 expect((await GET(new NextRequest('http://localhost/api/posts/publication-candidates?page=-1'))).status).toBe(400);
});
it('limits candidates to the active own channel and excludes deleted posts',async()=>{
 mocks.auth.mockResolvedValue({authorized:true,userId:3,role:'USER'});mocks.channel.mockResolvedValue({channelId:8});mocks.posts.mockResolvedValue([]);
 expect((await GET(new NextRequest('http://localhost/api/posts/publication-candidates'))).status).toBe(200);
 expect(mocks.channel).toHaveBeenCalledWith(expect.objectContaining({where:{userId:3,isMine:true,isActive:true,channel:{isActive:true}}}));
 expect(mocks.posts).toHaveBeenCalledWith(expect.objectContaining({where:{channelId:8,deletedAt:null},take:21}));
});
