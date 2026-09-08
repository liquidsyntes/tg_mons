import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function repair() {
  console.log('Starting repair for subscribersAtPublish...');
  
  let skip = 0;
  const batchSize = 500;
  let updatedCount = 0;
  let noSnapshotCount = 0;
  let hasMore = true;

  while (hasMore) {
    const posts = await prisma.post.findMany({
      select: { id: true, channelId: true, publishedAt: true },
      take: batchSize,
      skip: skip,
      orderBy: { id: 'asc' }
    });

    if (posts.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`Processing batch of ${posts.length} posts (skip: ${skip})...`);

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
        updatedCount++;
      } else {
        noSnapshotCount++;
      }
    }

    skip += batchSize;
  }
  
  console.log(`Repair completed. Updated ${updatedCount} posts. Left without snapshot: ${noSnapshotCount}.`);
}

repair()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
