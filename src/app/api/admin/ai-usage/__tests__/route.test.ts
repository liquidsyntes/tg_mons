import {it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const auth=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/auth',()=>({verifyBearerToken:auth}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
import {GET,POST} from '../route';
it('denies usage and limit administration to ordinary users before DB access',async()=>{
 auth.mockResolvedValue({authorized:true,userId:1,role:'USER'});
 expect((await GET(new NextRequest('http://localhost/api/admin/ai-usage'))).status).toBe(403);
 expect((await POST(new NextRequest('http://localhost/api/admin/ai-usage',{method:'POST',body:'{}'}))).status).toBe(403);
});
it('validates limit and pagination boundaries',async()=>{
 auth.mockResolvedValue({authorized:true,userId:1,role:'ADMIN'});
 expect((await GET(new NextRequest('http://localhost/api/admin/ai-usage?days=0'))).status).toBe(400);
 expect((await POST(new NextRequest('http://localhost/api/admin/ai-usage',{method:'POST',body:JSON.stringify({aiHourlyLimit:0,aiConcurrentLimit:0,aiProviderConcurrency:0})}))).status).toBe(400);
});
