import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function backfill() {
  console.log('Starting backfill for subscribersAtPublish...');
  
  const posts = await prisma.post.findMany({
    where: { subscribersAtPublish: null },
    select: { id: true, channelId: true, publishedAt: true }
  });
  
  console.log(`Found ${posts.length} posts to backfill.`);
  
  let updated = 0;
  for (const post of posts) {
    let bestSnapshot = await prisma.snapshot.findFirst({
      where: { channelId: post.channelId, collectedAt: { lte: post.publishedAt } },
      orderBy: { collectedAt: 'desc' }
    });
    
    if (!bestSnapshot) {
      bestSnapshot = await prisma.snapshot.findFirst({
        where: { channelId: post.channelId, collectedAt: { gt: post.publishedAt } },
        orderBy: { collectedAt: 'asc' }
      });
    }
    
    if (bestSnapshot) {
      await prisma.post.update({
        where: { id: post.id },
        data: { subscribersAtPublish: bestSnapshot.membersCount }
      });
      updated++;
    }
  }
  
  console.log(`Backfill completed. Updated ${updated} posts.`);
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
