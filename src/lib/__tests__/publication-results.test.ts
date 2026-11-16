import {it,expect,vi} from 'vitest';
const findMany=vi.hoisted(()=>vi.fn());
vi.mock('../prisma',()=>({prisma:{post:{findMany}}}));
import {loadPublicationResults} from '../publication-results';
it('hides inaccessible linked posts and preserves removed/unlinked states',async()=>{
 findMany.mockResolvedValue([]);
 const results=await loadPublicationResults(3,[{postId:1,publishedPostId:9,publicationLinkedAt:new Date()},{postId:2,publishedPostId:null,publicationLinkedAt:new Date()},{postId:3,publishedPostId:null,publicationLinkedAt:null}]);
 expect(results.get(1)).toEqual({state:'unavailable'});expect(results.get(2)).toEqual({state:'removed'});expect(results.get(3)).toEqual({state:'unlinked'});
 expect(findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({channel:{isActive:true,userChannels:{some:{userId:3,isActive:true}}}})}));
});
