import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import dotenv from 'dotenv';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

async function main() {
  console.log('=== TG Monitor MTProto Authorization ===\n');

  let apiIdStr = process.env.TG_API_ID;
  let apiHash = process.env.TG_API_HASH;
  let phone = process.env.TG_PHONE;

  if (!apiIdStr) {
    apiIdStr = await askQuestion('Enter TG_API_ID (from my.telegram.org): ');
  }
  if (!apiHash) {
    apiHash = await askQuestion('Enter TG_API_HASH (from my.telegram.org): ');
  }

  const apiId = parseInt(apiIdStr.trim(), 10);
  if (isNaN(apiId) || !apiHash) {
    console.error('Error: TG_API_ID and TG_API_HASH are required!');
    process.exit(1);
  }

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, apiId, apiHash.trim(), {
    connectionRetries: 5,
  });

  console.log('\nConnecting to Telegram servers...');
  await client.start({
    phoneNumber: async () => {
      if (phone && phone.trim()) return phone.trim();
      const p = await askQuestion('Enter your Telegram phone number (+1234567890): ');
      return p.trim();
    },
    password: async () => {
      const pwd = await askQuestion('Enter 2FA Password (if enabled, or press Enter): ');
      return pwd.trim();
    },
    phoneCode: async () => {
      const code = await askQuestion('Enter verification code received in Telegram/SMS: ');
      return code.trim();
    },
    onError: (err) => console.error('Auth error:', err),
  });

  console.log('\nAuthentication successful!');
  const sessionString = client.session.save() as unknown as string;

  console.log('\nYour TG_SESSION:');
  console.log('----------------------------------------');
  console.log(sessionString);
  console.log('----------------------------------------\n');

  // Update or create .env
  const envPath = path.resolve(process.cwd(), '.env');
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  const updateEnvKey = (content: string, key: string, value: string): string => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      return content.replace(regex, `${key}=${value}`);
    }
    return content ? `${content.trim()}\n${key}=${value}\n` : `${key}=${value}\n`;
  };

  envContent = updateEnvKey(envContent, 'TG_API_ID', apiId.toString());
  envContent = updateEnvKey(envContent, 'TG_API_HASH', apiHash.trim());
  envContent = updateEnvKey(envContent, 'TG_SESSION', sessionString);
  if (phone) {
    envContent = updateEnvKey(envContent, 'TG_PHONE', phone.trim());
  }

  fs.writeFileSync(envPath, envContent, 'utf-8');
  console.log(`Saved TG_SESSION and credentials to ${envPath}`);

  await client.disconnect();
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during auth:', err);
  rl.close();
  process.exit(1);
});
