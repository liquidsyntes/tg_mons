import { prisma } from '../src/lib/prisma';

async function main() {
  const posts = await prisma.post.findMany({
    where: { channelId: 1 },
    orderBy: { publishedAt: 'desc' },
    take: 20
  });

  for (const p of posts) {
    console.log(`[${p.publishedAt.toISOString()}] ID: ${p.messageId} - Grouped: ${p.groupedId} - Text length: ${p.text?.length || 0}`);
  }
}
main().catch(console.error);
