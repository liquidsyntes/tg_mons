/** @vitest-environment jsdom */
import {it,expect,vi,afterEach} from 'vitest';
import {aiRequest} from '../ai-request';
afterEach(()=>{vi.restoreAllMocks();sessionStorage.clear();});
it('coalesces concurrent clicks and keeps the action key after transport failure',async()=>{
 let resolve: ((r:Response)=>void)|undefined;
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(r=>{resolve=r;}));
 const a=aiRequest('/api/ai/test-double',{method:'POST'}),b=aiRequest('/api/ai/test-double',{method:'POST'});
 expect(fetcher).toHaveBeenCalledTimes(1);resolve!(new Response('{"summary":"ok"}'));
 expect(await (await a).json()).toEqual({summary:'ok'});expect(await (await b).json()).toEqual({summary:'ok'});
 fetcher.mockRejectedValueOnce(new Error('network'));
 await expect(aiRequest('/api/ai/test-network',{method:'POST'})).rejects.toThrow('network');
 const key=new Headers(fetcher.mock.calls.at(-1)?.[1]?.headers).get('Idempotency-Key');
 fetcher.mockResolvedValueOnce(new Response('{}'));
 await aiRequest('/api/ai/test-network',{method:'POST'});
 expect(new Headers(fetcher.mock.calls.at(-1)?.[1]?.headers).get('Idempotency-Key')).toBe(key);
});
it('requires explicit confirmation before a new action after unknown outcome',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:409}));
 await aiRequest('/api/ai/test-unknown',{method:'POST'});
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 await expect(aiRequest('/api/ai/test-unknown',{method:'POST'})).rejects.toThrow('отменена');
 expect(confirm).toHaveBeenCalledOnce();
});
