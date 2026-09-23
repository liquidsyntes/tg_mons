import { getTelegramClient } from '../src/worker/client';
import { fetchChannelMessages, resolveChannelEntity } from '../src/worker/fetcher';
import { readMessageContent } from '../src/worker/message-content';
import { extractPostMentions } from '../src/worker/post-mentions';
import { detectAd } from '../src/lib/adDetector';
import { prisma } from '../src/lib/prisma';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const channelId = Number(args.find(arg => arg.startsWith('--channel-id='))?.split('=')[1]);
  const limit = Number(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? 1000);
  const afterId = Number(args.find(arg => arg.startsWith('--after-id='))?.split('=')[1] ?? 0);
  const apply = args.includes('--apply');
  if (!Number.isSafeInteger(channelId) || channelId <= 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000 ||
      !Number.isSafeInteger(afterId) || afterId < 0 ||
      args.some(arg => !/^--(channel-id=\d+|limit=\d+|after-id=\d+|apply)$/.test(arg))) {
    throw new Error('Usage: npx tsx scripts/backfill-articles.ts --channel-id=N [--limit=1000] [--after-id=0] [--apply]');
  }
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
  const identifier = channel.username || channel.tgId?.toString();
  if (!identifier) throw new Error('Channel has no Telegram identifier');
  const posts = await prisma.post.findMany({
    where: { channelId, id: { gt: afterId }, OR: [{ text: null }, { text: '' }] },
    select: { id: true, messageId: true },
    orderBy: { id: 'asc' }, take: limit,
  });
  const client = await getTelegramClient();
  let recoverable = 0;
  let updated = 0;
  let unavailable = 0;
  try {
    const entity = await resolveChannelEntity(client, identifier);
    for (let offset = 0; offset < posts.length; offset += 100) {
      const batch = posts.slice(offset, offset + 100);
      const ids = batch.map(post => {
        const id = Number(post.messageId);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid stored message ID');
        return id;
      });
      const messages = await fetchChannelMessages(client, entity, { ids }, identifier);
      for (const message of messages) {
        if (!message?.richMessage) continue;
        const post = batch.find(item => item.messageId === BigInt(message.id));
        if (!post) continue;
        const content = await readMessageContent(message, () => client.getRichMessage(entity, message.id), {
          channelId, messageId: message.id,
        });
        if (!content.available) { unavailable++; continue; }
        if (!content.text) continue;
        recoverable++;
        if (!apply) continue;
        const ad = detectAd(content.text);
        const mentions = extractPostMentions(message, content.text, channel.username);
        updated += await prisma.$transaction(async tx => {
          // Another collector may have repaired this post while the request was in flight.
          const result = await tx.post.updateMany({
            where: { id: post.id, OR: [{ text: null }, { text: '' }] },
            data: { text: content.text, isAd: ad.isAd || ad.isPartner },
          });
          if (!result.count) return 0;
          await tx.mention.deleteMany({ where: { sourcePostId: post.id } });
          if (mentions.length) await tx.mention.createMany({
            data: mentions.map(mention => ({ ...mention, sourcePostId: post.id, sourceChannelId: channelId })),
          });
          return result.count;
        });
      }
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', candidates: posts.length, recoverable, updated, unavailable,
      lastScannedId: posts.at(-1)?.id ?? afterId }));
    if (updated) {
      console.log('Existing AI reports are unchanged. Refresh the web cache and regenerate reports after recovery.');
    }
  } finally {
    await client.destroy();
  }
}

main().catch(error => {
  // Do not print database errors, connection strings or Telegram payloads.
  console.error(error instanceof Error && error.message.startsWith('Usage:') ? error.message : 'Article recovery failed; no message contents are logged.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
