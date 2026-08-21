import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import dotenv from 'dotenv';

dotenv.config();

let clientInstance: TelegramClient | null = null;

export function getTelegramCredentials() {
  const apiIdStr = process.env.TG_API_ID;
  const apiHash = process.env.TG_API_HASH;
  const sessionString = process.env.TG_SESSION || '';

  if (!apiIdStr || !apiHash) {
    throw new Error(
      'TG_API_ID and TG_API_HASH must be configured in environment variables (.env).'
    );
  }

  const apiId = parseInt(apiIdStr, 10);
  if (isNaN(apiId)) {
    throw new Error('TG_API_ID must be a valid integer.');
  }

  return { apiId, apiHash, sessionString };
}

export async function getTelegramClient(): Promise<TelegramClient> {
  if (clientInstance && clientInstance.connected) {
    return clientInstance;
  }

  const { apiId, apiHash, sessionString } = getTelegramCredentials();
  const session = new StringSession(sessionString);

  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false,
  });

  await client.connect();
  clientInstance = client;
  return client;
}
