import { logger } from '@/lib/logger';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { runCollectCycle } from './collector';
import { runDemographicsCycle } from './demographics';
import { runAdReachCycle } from './ad-reach';

dotenv.config();

const cronSchedule = process.env.COLLECT_CRON || '0 * * * *';
const demographicsCron = process.env.DEMOGRAPHICS_CRON || '0 3 * * 0'; // Weekly on Sunday 3:00 AM
let isRunning = false;
let isDemographicsRunning = false;
let isAdReachRunning = false;

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

async function executeDemographicsCycle() {
  if (isDemographicsRunning) {
    logger.warn('Demographics cycle already in progress, skipping');
    return;
  }

  isDemographicsRunning = true;
  try {
    await runDemographicsCycle();
  } catch (err: any) {
    logger.error('Error during demographics cycle', undefined, err);
  } finally {
    isDemographicsRunning = false;
  }
}

async function executeAdReachCycle() {
  if (isAdReachRunning) {
    logger.warn('Ad Reach cycle already in progress, skipping');
    return;
  }

  isAdReachRunning = true;
  try {
    await runAdReachCycle();
  } catch (err: any) {
    logger.error('Error during ad reach cycle', undefined, err);
  } finally {
    isAdReachRunning = false;
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

  // Schedule weekly demographics collection
  if (!cron.validate(demographicsCron)) {
    logger.warn('Invalid demographics schedule; using weekly default');
  }
  cron.schedule(cron.validate(demographicsCron) ? demographicsCron : '0 3 * * 0', () => {
    logger.info('Demographics cron triggered');
    executeDemographicsCycle();
  });

  logger.info('Demographics cron scheduled', { demographicsCron });

  // Schedule hourly ad reach collection
  cron.schedule('15 * * * *', () => {
    logger.info('Ad Reach cron triggered');
    executeAdReachCycle();
  });
  
  logger.info('Ad Reach cron scheduled (hourly at minute 15)');

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
