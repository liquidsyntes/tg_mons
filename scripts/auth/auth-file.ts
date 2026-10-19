/**
 * Неинтерактивная авторизация MTProto: код и 2FA-пароль читаются из файлов.
 * Ожидает /run/auth/code.txt, при запросе 2FA — /run/auth/password.txt.
 * Результат: /run/auth/session.txt, лог: /run/auth/status.log
 */
import fs from 'fs';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const DIR = '/run/auth';
const log = (m: string) => fs.appendFileSync(`${DIR}/status.log`, `${new Date().toISOString()} ${m}\n`);

const apiId = parseInt(process.env.TG_API_ID || '', 10);
const apiHash = (process.env.TG_API_HASH || '').trim();
const phone = (process.env.TG_PHONE || '').trim();

function waitFor(name: string, timeoutMs = 20 * 60 * 1000): Promise<string> {
  const p = `${DIR}/${name}`;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = setInterval(() => {
      try {
        if (fs.existsSync(p)) {
          const v = fs.readFileSync(p, 'utf-8').trim();
          if (v) {
            clearInterval(tick);
            fs.unlinkSync(p);
            resolve(v);
            return;
          }
        }
      } catch (e) {
        // файл может исчезнуть между exists и read — просто ждём дальше
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(tick);
        reject(new Error(`timeout waiting for ${name}`));
      }
    }, 1000);
  });
}

async function main() {
  log(`start apiId=${apiId} phone=${phone.slice(0, 4)}***`);
  if (!apiId || !apiHash || !phone) throw new Error('TG_API_ID / TG_API_HASH / TG_PHONE не заданы');

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });
  await client.start({
    phoneNumber: async () => {
      log('PHONE_SENT');
      return phone;
    },
    phoneCode: async () => {
      log('CODE_REQUESTED');
      const code = await waitFor('code.txt');
      log('CODE_READ');
      return code;
    },
    password: async () => {
      log('PASSWORD_REQUESTED');
      const pwd = await waitFor('password.txt', 10 * 60 * 1000).catch(() => '');
      log('PASSWORD_READ');
      return pwd;
    },
    onError: (err) => log(`ERR ${err.message}`),
  });

  const session = client.session.save() as unknown as string;
  fs.writeFileSync(`${DIR}/session.txt`, session);
  log(`DONE session_length=${session.length}`);
  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  log(`FATAL ${err.message}`);
  process.exit(1);
});
