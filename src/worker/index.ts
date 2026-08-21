import cron from 'node-cron';
import dotenv from 'dotenv';
import { runCollectCycle } from './collector';

dotenv.config();

const cronSchedule = process.env.COLLECT_CRON || '0 * * * *';
let isRunning = false;

async function executeCycle() {
  if (isRunning) {
    console.log('[Worker] Collection cycle is already in progress, skipping trigger...');
    return;
  }

  isRunning = true;
  try {
    await runCollectCycle();
  } catch (err: any) {
    console.error('[Worker] Error during collection cycle:', err);
  } finally {
    isRunning = false;
  }
}

async function startWorker() {
  console.log('==============================================');
  console.log('       TG Monitor MTProto Collector Worker    ');
  console.log('==============================================');
  console.log(`Schedule cron: "${cronSchedule}"`);
  console.log(`Database URL: ${process.env.DATABASE_URL ? 'Configured' : 'Missing!'}`);
  console.log(`TG Session: ${process.env.TG_SESSION ? 'Configured' : 'Missing (run npm run auth)!'}`);
  console.log('----------------------------------------------\n');

  if (!cron.validate(cronSchedule)) {
    console.error(`Invalid cron schedule: "${cronSchedule}". Falling back to "0 * * * *"`);
  }

  // Schedule cron
  cron.schedule(cron.validate(cronSchedule) ? cronSchedule : '0 * * * *', () => {
    console.log(`[Worker] Cron triggered at ${new Date().toISOString()}`);
    executeCycle();
  });

  console.log('[Worker] Worker started and waiting for schedule.');

  // Optionally trigger initial cycle if enabled
  if (process.env.COLLECT_ON_STARTUP === 'true') {
    console.log('[Worker] Running initial collection cycle on startup...');
    await executeCycle();
  }
}

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`\n[Worker] Received ${signal}, shutting down gracefully...`);
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startWorker().catch((err) => {
  console.error('[Worker] Fatal error starting worker:', err);
  process.exit(1);
});
