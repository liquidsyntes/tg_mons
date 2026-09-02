import { Api } from 'telegram';
import { getTelegramClient } from '../src/worker/client';

async function main() {
  const client = await getTelegramClient();
  const entity = await client.getEntity('senioritas_bdsm');
  
  const messages = await client.getMessages(entity, {
    ids: [542, 543, 548, 549]
  });

  for (const msg of messages) {
    if (!msg) continue;
    console.log(`MSG ${msg.id}: text='${msg.message ? msg.message.substring(0, 50) : ''}', groupedId=${msg.groupedId}, media=${msg.media ? msg.media.className : 'none'}`);
  }

  process.exit(0);
}

main().catch(console.error);
