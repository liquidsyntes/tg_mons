import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import dotenv from 'dotenv';

dotenv.config();

let clientInstance: TelegramClient | null = null;

export function isLocalWorkerMode(): boolean {
  return process.env.WORKER_LOCAL_MODE === 'true' || process.argv.includes('--local');
}

export function getTelegramCredentials() {
  const apiIdStr = process.env.TG_API_ID;
  const apiHash = process.env.TG_API_HASH;
  const localMode = isLocalWorkerMode();
  const sessionString = localMode
    ? (process.env.TG_SESSION_LOCAL || '')
    : (process.env.TG_SESSION || process.env.TG_SESSION_LOCAL || '');

  if (!apiIdStr || !apiHash) {
    throw new Error(
      'TG_API_ID and TG_API_HASH must be configured in environment variables (.env).'
    );
  }

  if (localMode && !sessionString) {
    throw new Error(
      'TG_SESSION_LOCAL is required in local worker mode. Run "npm run auth:local" to create an isolated local session.'
    );
  }

  const apiId = parseInt(apiIdStr, 10);
  if (isNaN(apiId)) {
    throw new Error('TG_API_ID must be a valid integer.');
  }

  return { apiId, apiHash, sessionString, localMode };
}

export async function getTelegramClient(): Promise<TelegramClient> {
  if (clientInstance && clientInstance.connected) {
    return clientInstance;
  }

  const { apiId, apiHash, sessionString, localMode } = getTelegramCredentials();
  const session = new StringSession(sessionString);

  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    deviceModel: localMode ? 'TgMon Local Dev' : 'TgMon Server Worker',
    systemVersion: 'Windows 11 x64',
    appVersion: '5.7.2 x64',
  });

  await client.connect();
  clientInstance = client;
  return client;
}

export async function disconnectTelegramClient(): Promise<void> {
  const client = clientInstance;
  clientInstance = null;
  if (client) await client.disconnect();
}
