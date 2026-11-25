import {it,expect} from 'vitest';
import {prisma} from '@/lib/prisma';
const enabled = process.env.PUBLICATION_PERFORMANCE_INTEGRATION === '1' || process.env.RUN_DB_INTEGRATION_TESTS === 'true';
if(enabled&&!new URL(process.env.DATABASE_URL??'').pathname.endsWith('_ai87_test'))throw new Error('Dedicated test database required');
it.skipIf(!enabled)('keeps one checkpoint and preserves reference after linked publication deletion',async()=>{
 const channel=await prisma.channel.create({data:{type:'channel',title:'Publication integration',tgId:BigInt(Date.now()),username:'integration_'+Date.now()}});
 const user=await prisma.user.create({data:{username:'publication_'+Date.now()}});
 try {
   const ref=await prisma.post.create({data:{channelId:channel.id,messageId:1n,publishedAt:new Date()}});
   const target=await prisma.post.create({data:{channelId:channel.id,messageId:2n,publishedAt:new Date()}});
   const saved=await prisma.userSavedPost.create({data:{userId:user.id,postId:ref.id,publishedPostId:target.id,publicationLinkedAt:new Date(),status:'published',draftText:'Keep'}});
   const row={postId:target.id,hoursAfterPost:24,views:0,capturedAt:new Date(),source:'test'};
   await Promise.all([prisma.postPerformanceCheckpoint.createMany({data:[row],skipDuplicates:true}),prisma.postPerformanceCheckpoint.createMany({data:[row],skipDuplicates:true})]);
   expect(await prisma.postPerformanceCheckpoint.count({where:{postId:target.id}})).toBe(1);
   await prisma.post.delete({where:{id:target.id}});
   const result=await prisma.userSavedPost.findUniqueOrThrow({where:{id:saved.id}});
   expect(result).toMatchObject({postId:ref.id,publishedPostId:null,status:'published',draftText:'Keep'});
   expect(result.publicationLinkedAt).not.toBeNull();
 } finally {
   await prisma.user.delete({where:{id:user.id}});await prisma.channel.delete({where:{id:channel.id}});await prisma.$disconnect();
 }
});
