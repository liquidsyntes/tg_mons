import { logger } from '@/lib/logger';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { runCollectCycle } from './collector';

dotenv.config();

const cronSchedule = process.env.COLLECT_CRON || '0 * * * *';
let isRunning = false;

async function executeCycle() {
  if (isRunning) {
    logger.warn('Collection cycle already in progress, skipping trigger');
    return;
  }

  isRunning = true;
  try {
    await runCollectCycle();
  } catch (err: any) {
    logger.error('Error during collection cycle', undefined, err);
  } finally {
    isRunning = false;
  }
}

async function startWorker() {
  logger.info('TG Monitor MTProto Collector Worker Started', { cronSchedule, dbConfigured: !!process.env.DATABASE_URL, tgSessionConfigured: !!process.env.TG_SESSION });

  if (!cron.validate(cronSchedule)) {
    logger.error('Invalid cron schedule', { cronSchedule, fallback: '0 * * * *' });
  }

  // Schedule cron
  cron.schedule(cron.validate(cronSchedule) ? cronSchedule : '0 * * * *', () => {
    logger.info('Cron triggered');
    executeCycle();
  });

  logger.info('Worker started and waiting for schedule');

  // Optionally trigger initial cycle if enabled
  if (process.env.COLLECT_ON_STARTUP === 'true') {
    logger.info('Running initial collection cycle on startup');
    await executeCycle();
  }
}

// Graceful shutdown
const shutdown = (signal: string) => {
  logger.info('Shutting down gracefully', { signal });
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startWorker().catch((err) => {
  logger.error('Fatal error starting worker', undefined, err);
  process.exit(1);
});
