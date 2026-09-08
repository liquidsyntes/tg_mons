// scripts/audit-metrics.ts
// Диагностика пустых метрик в главной таблице tg_mons.
// Запуск: npx tsx scripts/audit-metrics.ts
// Скрипт только читает БД, ничего не изменяет.

import { prisma } from '../src/lib/prisma';

const MS_HOUR = 3600 * 1000;

async function main() {
  const now = new Date();
  const d24h = new Date(now.getTime() - 24 * MS_HOUR);
  const d7d = new Date(now.getTime() - 7 * 24 * MS_HOUR);
  const d30d = new Date(now.getTime() - 30 * 24 * MS_HOUR);
  const todayStart = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');

  console.log('=== АУДИТ МЕТРИК tg_mons ===');
  console.log('Время запуска:', now.toISOString(), '\n');

  // 1. Последние циклы сбора
  const jobs = await prisma.syncJob.findMany({ orderBy: { id: 'desc' }, take: 5 });
  console.log('--- Последние SyncJob ---');
  for (const j of jobs) {
    console.log(
      `#${j.id} ${j.status} | старт: ${j.startedAt.toISOString()} | ок: ${j.channelsSucceeded} / ${j.channelsTotal} | ошибок: ${j.channelsFailed} | постов: ${j.postsAdded}`
    );
  }
  if (jobs.length === 0) console.log('SyncJob записей нет. Воркер вообще запускался?');
  const lastDone = jobs.find(j => j.status === 'COMPLETED' || j.status === 'PARTIAL');
  if (lastDone && now.getTime() - lastDone.startedAt.getTime() > 3 * MS_HOUR) {
    console.log('!! Последний успешный цикл был больше 3 часов назад. Каналы будут в статусе stale.');
  }

  const channels = await prisma.channel.findMany({ orderBy: [{ isMine: 'desc' }, { id: 'asc' }] });
  console.log(`\n--- Каналы (${channels.length}) ---\n`);

  for (const ch of channels) {
    const dailyCount = await prisma.channelMetricDaily.count({
      where: { channelId: ch.id, date: { gte: d30d } },
    });
    const todayRow = await prisma.channelMetricDaily.findUnique({
      where: { channelId_date: { channelId: ch.id, date: todayStart } },
    });
    const lastSnapshot = await prisma.snapshot.findFirst({
      where: { channelId: ch.id },
      orderBy: { collectedAt: 'desc' },
    });
    const snapshotCount = await prisma.snapshot.count({ where: { channelId: ch.id } });

    const posts7d = await prisma.post.findMany({
      where: { channelId: ch.id, publishedAt: { gte: d7d } },
      select: { views: true, reactions: true, subscribersAtPublish: true, publishedAt: true },
    });
    const posts24h = posts7d.filter(p => p.publishedAt >= d24h);

    const engine = dailyCount > 0 ? 'MATERIALIZED' : 'FALLBACK (on-the-fly)';

    // Реплика логики пустых ячеек из aggregate.ts / engagement.ts
    const noSubs = posts7d.filter(p => !p.subscribersAtPublish || p.subscribersAtPublish <= 0).length;
    const noSubs24 = posts24h.filter(p => !p.subscribersAtPublish || p.subscribersAtPublish <= 0).length;
    const viewsOk7d = posts7d.filter(p => p.views !== null && p.views > 0).length;
    const viewsOk24 = posts24h.filter(p => p.views !== null && p.views > 0).length;
    const anyReactions7d = posts7d.some(p => (p.reactions || 0) > 0);
    const anyReactions24 = posts24h.some(p => (p.reactions || 0) > 0);

    const empty: string[] = [];
    if (!lastSnapshot && dailyCount === 0) empty.push('Subscribers (нет ни одного снапшота)');
    if (posts24h.length === 0) empty.push('ER/ERR 24h (нет постов за 24ч)');
    else {
      if (noSubs24 === posts24h.length) empty.push('ER 24h (нет subscribersAtPublish)');
      if (viewsOk24 === 0) empty.push('ERR 24h (нет просмотров)');
      else if (!anyReactions24) empty.push('ERR 24h (все реакции 0/скрыты)');
    }
    if (posts7d.length === 0) empty.push('ER/ERR/Views 7d + Last Fact (нет постов за 7д)');
    else {
      if (noSubs === posts7d.length) empty.push('ER 7d (ни у одного поста нет subscribersAtPublish)');
      if (viewsOk7d === 0) empty.push('Views/VR/ERR 7d (просмотры null, типично для групп)');
      else if (!anyReactions7d) empty.push('ERR 7d (все реакции 0/скрыты)');
    }
    if (dailyCount > 0 && !todayRow) empty.push('Views 24h (сегодняшняя daily-строка еще не создана, UTC-дата)');
    if (noSubs > 0 && noSubs < posts7d.length) empty.push(`ER 7d частично (${noSubs} из ${posts7d.length} постов без subscribersAtPublish)`);

    console.log(`[${ch.id}] ${ch.title} (@${ch.username || ch.tgId}) ${ch.isMine ? '[МОЙ]' : ''}`);
    console.log(`  тип: ${ch.type} | active: ${ch.isActive} | ошибок подряд: ${ch.consecutiveErrors} | lastError: ${ch.lastError || 'нет'}`);
    console.log(`  последний сбор: ${ch.lastCollectedAt ? ch.lastCollectedAt.toISOString() : 'НИКОГДА'}`);
    console.log(`  движок: ${engine} | daily-строк за 30д: ${dailyCount} | снапшотов всего: ${snapshotCount} | последний: ${lastSnapshot ? lastSnapshot.membersCount + ' подп.' : 'нет'}`);
    console.log(`  постов 24ч/7д: ${posts24h.length}/${posts7d.length} | без subscribersAtPublish (7д): ${noSubs} | с views=null (7д): ${posts7d.length - viewsOk7d}`);
    console.log(empty.length > 0 ? `  ПУСТЫЕ ЯЧЕЙКИ: ${empty.join(' | ')}` : '  все ключевые ячейки должны быть заполнены');
    console.log('');
  }

  // 2. Глобальные счетчики для backfill
  const postsNoSubs = await prisma.post.count({ where: { subscribersAtPublish: null } });
  console.log('--- Глобально ---');
  console.log(`Постов без subscribersAtPublish (вся БД): ${postsNoSubs}`);
  if (postsNoSubs > 0) {
    console.log('Рекомендация: npx tsx scripts/backfill-subscribers.ts (после фикса перезаписи в persister.ts!)');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
