import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial TG Monitor data...');

  // Clean old records
  await prisma.post.deleteMany();
  await prisma.snapshot.deleteMany();
  await prisma.channel.deleteMany();

  const now = new Date();
  const MS_DAY = 24 * 3600 * 1000;
  const MS_HOUR = 3600 * 1000;

  // 1. My Channel
  const myChannel = await prisma.channel.create({
    data: {
      title: 'Creative Tech & AI Studio',
      username: 'creative_ai_studio',
      tgId: BigInt(10015829102),
      type: 'channel',
      isMine: true,
      isActive: true,
      lastMessageId: BigInt(342),
      lastCollectedAt: new Date(now.getTime() - 15 * 60 * 1000), // 15 mins ago
      createdAt: new Date(now.getTime() - 40 * MS_DAY),
    },
  });

  // 2. Competitors
  const comp1 = await prisma.channel.create({
    data: {
      title: 'AI Dev & Neural Tools',
      username: 'ai_neural_tools',
      tgId: BigInt(10016928192),
      type: 'channel',
      isMine: false,
      isActive: true,
      lastMessageId: BigInt(810),
      lastCollectedAt: new Date(now.getTime() - 25 * 60 * 1000),
      createdAt: new Date(now.getTime() - 60 * MS_DAY),
    },
  });

  const comp2 = await prisma.channel.create({
    data: {
      title: 'Sound Design & Synth Lab',
      username: 'synth_sound_lab',
      tgId: BigInt(10014829184),
      type: 'channel',
      isMine: false,
      isActive: true,
      lastMessageId: BigInt(210),
      lastCollectedAt: new Date(now.getTime() - 40 * 60 * 1000),
      createdAt: new Date(now.getTime() - 50 * MS_DAY),
    },
  });

  const comp3 = await prisma.channel.create({
    data: {
      title: 'Web & UI Engineering',
      username: 'web_ui_digest',
      tgId: BigInt(10019283741),
      type: 'channel',
      isMine: false,
      isActive: true,
      lastMessageId: BigInt(512),
      lastCollectedAt: new Date(now.getTime() - 10 * 60 * 1000),
      createdAt: new Date(now.getTime() - 45 * MS_DAY),
    },
  });

  const channelsConfig = [
    { channel: myChannel, baseSubs: 12450, growthDay: 18, postRate: 2.2 },
    { channel: comp1, baseSubs: 24800, growthDay: 42, postRate: 4.5 },
    { channel: comp2, baseSubs: 8900, growthDay: 6, postRate: 1.1 },
    { channel: comp3, baseSubs: 15300, growthDay: -2, postRate: 3.0 },
  ];

  for (const item of channelsConfig) {
    const ch = item.channel;

    // Generate snapshots over 30 days
    for (let day = 30; day >= 0; day--) {
      const snapDate = new Date(now.getTime() - day * MS_DAY);
      const subs = Math.round(item.baseSubs - day * item.growthDay + (Math.random() * 10 - 5));
      await prisma.snapshot.create({
        data: {
          channelId: ch.id,
          membersCount: Math.max(subs, 100),
          collectedAt: snapDate,
        },
      });
    }

    // Generate recent hourly snapshots for today
    for (let h = 23; h >= 0; h -= 2) {
      const snapDate = new Date(now.getTime() - h * MS_HOUR);
      const subs = Math.round(item.baseSubs + (24 - h) * (item.growthDay / 24));
      await prisma.snapshot.create({
        data: {
          channelId: ch.id,
          membersCount: Math.max(subs, 100),
          collectedAt: snapDate,
        },
      });
    }

    // Generate posts history
    let msgCounter = 1;
    for (let day = 30; day >= 0; day--) {
      const postCount = Math.floor(item.postRate + (Math.random() > 0.5 ? 1 : 0));
      for (let p = 0; p < postCount; p++) {
        const postDate = new Date(
          now.getTime() - day * MS_DAY + (p * 4 + 8) * MS_HOUR + Math.random() * 30 * 60 * 1000
        );
        if (postDate.getTime() <= now.getTime()) {
          await prisma.post.create({
            data: {
              channelId: ch.id,
              messageId: BigInt(msgCounter++),
              publishedAt: postDate,
              views: Math.round(item.baseSubs * (0.25 + Math.random() * 0.3)),
            },
          });
        }
      }
    }
  }

  console.log('✓ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
