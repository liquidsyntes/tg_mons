/**
 * Авторизация Telegram по QR-коду (без кодов из SMS/приложения).
 * Пишет текущий tg://login-линк в /run/auth/qrlink.txt (обновляется каждые ~30 с).
 * При запросе 2FA-пароля читает /run/auth/password.txt.
 * Результат: /run/auth/session.txt, лог: /run/auth/qrstatus.log
 */
import fs from 'fs';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const DIR = '/run/auth';
const log = (m: string) => fs.appendFileSync(`${DIR}/qrstatus.log`, `${new Date().toISOString()} ${m}\n`);

const apiId = parseInt(process.env.TG_API_ID || '', 10);
const apiHash = (process.env.TG_API_HASH || '').trim();

function waitFor(name: string, timeoutMs = 10 * 60 * 1000): Promise<string> {
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
      } catch {}
      if (Date.now() - start > timeoutMs) {
        clearInterval(tick);
        reject(new Error(`timeout waiting for ${name}`));
      }
    }, 1000);
  });
}

async function main() {
  log(`start apiId=${apiId}`);
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });
  await client.connect();

  await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      qrCode: async ({ token, expires }) => {
        const url = `tg://login?token=${token.toString('base64url')}`;
        // в разных версиях teleproto expires приходит либо Date, либо unix-временем в секундах
        const raw: unknown = expires;
        const expMs = raw instanceof Date ? raw.getTime() : Number(raw) * (Number(raw) < 1e11 ? 1000 : 1);
        fs.writeFileSync(`${DIR}/qrlink.txt`, JSON.stringify({ url, expires: expMs }));
        log(`QR_UPDATED expires=${new Date(expMs).toISOString()}`);
      },
      password: async () => {
        log('PASSWORD_REQUESTED');
        const pwd = await waitFor('password.txt');
        log('PASSWORD_READ');
        return pwd;
      },
      onError: (err) => log(`ERR ${err.message}`),
    },
  );

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
