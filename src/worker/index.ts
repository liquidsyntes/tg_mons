import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { runDailyDigestIfDue } from '@/lib/digest';
import type { AddChannelCommandResult } from '@/lib/telegram-bot-commands';
import cron, { type ScheduledTask } from 'node-cron';
import dotenv from 'dotenv';
import type { Server } from 'node:http';
import { addChannelByInput, collectChannelData, getActiveSyncJobId, runCollectCycle } from './collector';
import { runDemographicsCycle } from './demographics';
import { runAdReachCycle } from './ad-reach';
import { runEventsScan } from './events-scan';
import { disconnectTelegramClient, getTelegramClient } from './client';
import { markInterruptedSyncJob } from './persister';
import { shouldRecoverSyncJobOnStartup } from './sync-jobs';
import { createWorkerServer, listenWorkerServer } from './server';
import { TaskAlreadyQueuedError, TaskCoordinator, WorkerStoppingError, type WorkerTaskKind } from './task-coordinator';
import { createTelegramBotPoller, type TelegramBotPoller } from './bot-poller';

dotenv.config();

const cronSchedule = process.env.COLLECT_CRON || '0 * * * *';
const demographicsCron = process.env.DEMOGRAPHICS_CRON || '0 3 * * 0';
const coordinator = new TaskCoordinator();
const scheduled: ScheduledTask[] = [];
let server: Server | null = null;
let shuttingDown = false;
let activeDigest: Promise<void> | null = null;
let activeEventScan: Promise<void> | null = null;
let botPoller: TelegramBotPoller | null = null;

async function invalidateWebCacheBestEffort(): Promise<void> {
  const webInternalUrl = process.env.WEB_INTERNAL_URL;
  const token = process.env.COLLECT_API_TOKEN;
  if (!webInternalUrl || !token) return;
  try {
    await fetch(`${webInternalUrl.replace(/\/+$/, '')}/api/internal/invalidate-cache`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    logger.warn('Failed to invalidate web cache after bot command', undefined, err);
  }
}

async function addChannelFromBotCommand(
  target: string,
  userId: number | null,
): Promise<AddChannelCommandResult> {
  const cleanUsername = target.replace(/^@+/, '').toLowerCase();
  try {
    const existing = await prisma.channel.findFirst({
      where: { username: { equals: cleanUsername, mode: 'insensitive' } },
      select: { id: true, title: true, username: true, isActive: true },
    });

    if (existing) {
      if (!existing.isActive) {
        await prisma.channel.update({
          where: { id: existing.id },
          data: { isActive: true, consecutiveErrors: 0, lastError: null },
        });
      }
      if (userId != null) {
        await prisma.userChannel.upsert({
          where: { userId_channelId: { userId, channelId: existing.id } },
          update: { isActive: true },
          create: { userId, channelId: existing.id, isActive: true },
        });
      }
      await invalidateWebCacheBestEffort();
      return {
        added: true,
        alreadyExists: true,
        channelId: existing.id,
        title: existing.title,
        username: existing.username,
      };
    }

    const addedChannel = await coordinator.run('add-channel', async (signal) => {
      const channel = await addChannelByInput(target, false);
      if (!signal.aborted) {
        try {
          const client = await getTelegramClient();
          await collectChannelData(client, channel, true);
        } catch (err) {
          logger.warn('Initial channel backfill from bot failed', { channelId: channel.id }, err);
          await prisma.channel.update({
            where: { id: channel.id },
            data: { lastError: err instanceof Error ? err.message : 'Ошибка первичного сбора' },
          });
        }
      }
      return channel;
    });

    if (userId != null) {
      await prisma.userChannel.upsert({
        where: { userId_channelId: { userId, channelId: addedChannel.id } },
        update: { isActive: true },
        create: { userId, channelId: addedChannel.id, isActive: true },
      });
    }

    await invalidateWebCacheBestEffort();
    return {
      added: true,
      alreadyExists: false,
      channelId: addedChannel.id,
      title: addedChannel.title,
      username: addedChannel.username,
    };
  } catch (error) {
    if (error instanceof WorkerStoppingError) {
      return {
        added: false,
        message: 'Воркер сейчас останавливается. Повторите /add через минуту.',
      };
    }
    const reason = error instanceof Error ? error.message : 'Неизвестная ошибка';
    logger.warn('Bot /add channel failed', { target, userId, reason });
    return {
      added: false,
      message: `Не удалось добавить канал ${target}: ${reason}`,
    };
  }
}

async function execute(kind: WorkerTaskKind, run: (signal: AbortSignal) => Promise<unknown>): Promise<void> {
  try {
    await coordinator.run(kind, run);
  } catch (error) {
    if (error instanceof TaskAlreadyQueuedError) {
      logger.info('Worker task already queued or running', { kind });
    } else if (!shuttingDown) {
      logger.error('Worker task failed', { kind }, error);
    }
  }
}

async function startWorker(): Promise<void> {
  const localMode = process.env.WORKER_LOCAL_MODE === 'true' || process.argv.includes('--local');
  const disableCron = process.env.WORKER_DISABLE_CRON === 'true' || process.argv.includes('--no-cron');
  const sessionConfigured = localMode ? !!process.env.TG_SESSION_LOCAL : !!(process.env.TG_SESSION || process.env.TG_SESSION_LOCAL);

  logger.info('TG Monitor MTProto Collector Worker Started', {
    localMode,
    disableCron,
    cronSchedule,
    dbConfigured: !!process.env.DATABASE_URL,
    tgSessionConfigured: sessionConfigured,
  });
  if (!process.env.COLLECT_API_TOKEN) throw new Error('COLLECT_API_TOKEN is required for worker internal API');
  server = createWorkerServer(coordinator);
  await listenWorkerServer(server);

  if (disableCron) {
    logger.info('Worker running in on-demand mode (background cron disabled; responding to UI requests only)');
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const botPollingEnabled = process.env.TELEGRAM_BOT_POLLING_ENABLED !== 'false';
  if (botToken && botPollingEnabled) {
    botPoller = createTelegramBotPoller({
      token: botToken,
      commandDeps: {
        onAddChannel: addChannelFromBotCommand,
      },
    });
    botPoller.start();
  } else if (botToken && !botPollingEnabled) {
    logger.info('Telegram bot command polling disabled via TELEGRAM_BOT_POLLING_ENABLED');
  }

  if (!cron.validate(cronSchedule)) {
    logger.error('Invalid cron schedule', { cronSchedule, fallback: '0 * * * *' });
  }
  const collectTask = cron.schedule(cron.validate(cronSchedule) ? cronSchedule : '0 * * * *', () => {
    logger.info('Cron triggered');
    void execute('collect', signal => runCollectCycle(signal));
  });
  let recoveringMissedCollection = false;
  collectTask.on('execution:missed', () => {
    if (shuttingDown || recoveringMissedCollection) return;
    recoveringMissedCollection = true;
    logger.warn('Scheduled collection missed; running recovery cycle');
    void execute('collect', signal => runCollectCycle(signal))
      .finally(() => { recoveringMissedCollection = false; });
  });
  scheduled.push(collectTask);
  logger.info('Worker started and waiting for schedule');

  if (!cron.validate(demographicsCron)) {
    logger.warn('Invalid demographics schedule; using weekly default');
  }
  scheduled.push(cron.schedule(cron.validate(demographicsCron) ? demographicsCron : '0 3 * * 0', () => {
    logger.info('Demographics cron triggered');
    void execute('demographics', () => runDemographicsCycle());
  }));
  logger.info('Demographics cron scheduled', { demographicsCron });

  scheduled.push(cron.schedule('15 * * * *', () => {
    logger.info('Ad Reach cron triggered');
    void execute('ad-reach', () => runAdReachCycle());
  }));
  logger.info('Ad Reach cron scheduled (hourly at minute 15)');

  if (!localMode) {
    scheduled.push(cron.schedule('*/5 * * * *', () => {
      if (activeDigest) return;
      const run = runDailyDigestIfDue().then(() => {}, error => {
        logger.error('Daily digest check failed', undefined, error);
      });
      activeDigest = run;
      void run.finally(() => { if (activeDigest === run) activeDigest = null; });
    }, { timezone: 'UTC' }));
    logger.info('Daily digest check scheduled (every 5 minutes, UTC)');
  }

  const eventsScanCron = process.env.EVENTS_SCAN_CRON?.trim();
  if (!localMode && eventsScanCron) {
    if (cron.validate(eventsScanCron)) {
      scheduled.push(cron.schedule(eventsScanCron, () => {
        if (activeEventScan) return;
        const run = runEventsScan().catch(error => {
          logger.error('Event scan failed', undefined, error);
        });
        activeEventScan = run;
        void run.finally(() => { if (activeEventScan === run) activeEventScan = null; });
      }, { timezone: 'UTC' }));
      logger.info('Event scan scheduled', { eventsScanCron });
    } else {
      logger.warn('Invalid EVENTS_SCAN_CRON; event scanning disabled');
    }
  }

  if (process.env.COLLECT_ON_STARTUP === 'true') {
    logger.info('Running initial collection cycle on startup');
    await execute('collect', signal => runCollectCycle(signal));
  } else {
    try {
      if (await shouldRecoverSyncJobOnStartup()) {
        logger.warn('Stale SyncJob found on startup; running recovery cycle');
        await execute('collect', signal => runCollectCycle(signal));
      }
    } catch (error) {
      logger.warn('Could not check SyncJob freshness on startup', undefined, error);
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down worker', { signal });
  for (const task of scheduled) task.stop();
  const pollerStopped = botPoller ? botPoller.stop() : Promise.resolve();
  const serverClosed = server
    ? new Promise<void>(resolve => server?.close(() => resolve()))
    : Promise.resolve();
  coordinator.requestShutdown();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const finished = await Promise.race([
    Promise.all([
      pollerStopped,
      coordinator.waitForIdle(),
      activeDigest ?? Promise.resolve(),
      activeEventScan ?? Promise.resolve(),
    ]).then(() => true),
    new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 30_000); }),
  ]);
  if (timer) clearTimeout(timer);
  if (!finished) {
    const syncJobId = getActiveSyncJobId();
    if (syncJobId !== null) {
      try {
        await markInterruptedSyncJob(syncJobId);
      } catch (error) {
        logger.error('Could not finalize interrupted SyncJob', { syncJobId }, error);
      }
    }
    server?.closeAllConnections();
  } else {
    await Promise.race([
      serverClosed,
      new Promise<void>(resolve => setTimeout(resolve, 2_000)),
    ]);
  }
  try {
    await disconnectTelegramClient();
  } catch (error) {
    logger.warn('Could not disconnect Telegram client', undefined, error);
  }
  process.exit(finished ? 0 : 1);
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

startWorker().catch((error) => {
  logger.error('Fatal error starting worker', undefined, error);
  void shutdown('startup failure');
});
