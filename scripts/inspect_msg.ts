import { Api } from 'telegram';
import { getTelegramClient } from '.../src/worker/client';

async function main() {
  const client = await getTelegramClient();
  const entity = await client.getEntity('senioritas_bdsm');
  
  const messages = await client.getMessages(entity, {
    ids: [553]
  });

  const msg = messages[0];
  console.log(JSON.stringify(msg, (key, value) => {
    if (key === 'originalArgs' || key === 'client') return undefined;
    if (typeof value === 'bigint') return value.toString();
    return value;
  }, 2));

  process.exit(0);
}

main().catch(console.error);
