import { logger } from '@/lib/logger';
import cron, { type ScheduledTask } from 'node-cron';
import dotenv from 'dotenv';
import type { Server } from 'node:http';
import { getActiveSyncJobId, runCollectCycle } from './collector';
import { runDemographicsCycle } from './demographics';
import { runAdReachCycle } from './ad-reach';
import { disconnectTelegramClient } from './client';
import { markInterruptedSyncJob } from './persister';
import { createWorkerServer, listenWorkerServer } from './server';
import { TaskAlreadyQueuedError, TaskCoordinator, type WorkerTaskKind } from './task-coordinator';

dotenv.config();

const cronSchedule = process.env.COLLECT_CRON || '0 * * * *';
const demographicsCron = process.env.DEMOGRAPHICS_CRON || '0 3 * * 0';
const coordinator = new TaskCoordinator();
const scheduled: ScheduledTask[] = [];
let server: Server | null = null;
let shuttingDown = false;

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

  if (!cron.validate(cronSchedule)) {
    logger.error('Invalid cron schedule', { cronSchedule, fallback: '0 * * * *' });
  }
  scheduled.push(cron.schedule(cron.validate(cronSchedule) ? cronSchedule : '0 * * * *', () => {
    logger.info('Cron triggered');
    void execute('collect', signal => runCollectCycle(signal));
  }));
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

  if (process.env.COLLECT_ON_STARTUP === 'true') {
    logger.info('Running initial collection cycle on startup');
    await execute('collect', signal => runCollectCycle(signal));
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down worker', { signal });
  for (const task of scheduled) task.stop();
  const serverClosed = server
    ? new Promise<void>(resolve => server?.close(() => resolve()))
    : Promise.resolve();
  coordinator.requestShutdown();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const finished = await Promise.race([
    coordinator.waitForIdle().then(() => true),
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
