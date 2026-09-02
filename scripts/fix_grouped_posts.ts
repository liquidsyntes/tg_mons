import { prisma } from '../src/lib/prisma';
import { getTelegramClient } from '../src/worker/client';

async function main() {
  const client = await getTelegramClient();
  const channels = await prisma.channel.findMany({ where: { isActive: true } });
  
  let totalDeleted = 0;

  for (const channel of channels) {
    if (!channel.username) continue;
    console.log(`Processing ${channel.username}...`);
    try {
      const entity = await client.getEntity(channel.username);
      const messages = await client.getMessages(entity, { limit: 200 });
      
      const groups = new Map<string, number[]>();

      for (const msg of messages) {
        if (msg.groupedId) {
          const gid = msg.groupedId.toString();
          if (!groups.has(gid)) groups.set(gid, []);
          groups.get(gid)!.push(msg.id);
        }
      }

      for (const [gid, msgIds] of groups.entries()) {
        const msgsInGroup = messages.filter(m => msgIds.includes(m.id));
        const msgWithText = msgsInGroup.find(m => m.message);
        const keeperId = msgWithText ? msgWithText.id : Math.max(...msgIds);

        const idsToDelete = msgIds.filter(id => id !== keeperId);
        if (idsToDelete.length > 0) {
          const res = await prisma.post.deleteMany({
            where: { channelId: channel.id, messageId: { in: idsToDelete } }
          });
          totalDeleted += res.count;
          
          await prisma.post.updateMany({
            where: { channelId: channel.id, messageId: keeperId },
            data: { groupedId: BigInt(gid), text: msgWithText?.message || undefined }
          });
        }
      }
    } catch (err: any) {
      console.log(`Skipped ${channel.username}: ${err.message}`);
    }
  }

  console.log(`Total Deleted ${totalDeleted} duplicate posts across all channels.`);
  process.exit(0);
}

main().catch(console.error);
