import readline from 'readline';
import http from 'node:http';
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
  const isLocal = process.argv.includes('--local');
  const useQr = process.argv.includes('--qr');
  const targetEnvKey = isLocal ? 'TG_SESSION_LOCAL' : 'TG_SESSION';
  const deviceModel = isLocal ? 'TgMon Local Dev' : 'TgMon Server Worker';

  console.log(`=== TG Monitor MTProto Authorization (${isLocal ? 'LOCAL DEV SESSION' : 'SERVER SESSION'}) ===\n`);

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
    deviceModel,
    systemVersion: 'Windows 11 x64',
    appVersion: '5.7.2 x64',
  });

  console.log(`\nConnecting to Telegram servers as "${deviceModel}"...`);

  let qrServer: http.Server | null = null;
  let currentQrUrl = '';
  let need2FaPassword = false;
  let doneAuth = false;
  let resolveWebPassword: ((pwd: string) => void) | null = null;

  if (useQr) {
    const qrPort = Number(process.env.AUTH_QR_PORT || 4099);
    qrServer = http.createServer((req, res) => {
      if (req.url === '/state') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ qrUrl: currentQrUrl, need2FaPassword, doneAuth }));
        return;
      }
      if (req.url === '/password' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { password?: string };
            if (parsed.password && resolveWebPassword) {
              need2FaPassword = false;
              resolveWebPassword(parsed.password.trim());
              resolveWebPassword = null;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.writeHead(400);
            res.end();
          }
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>TgMon — Вход по QR-коду</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1e293b; padding: 32px; border-radius: 8px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
    .qr-box { background: #fff; padding: 16px; border-radius: 8px; display: inline-block; margin: 20px 0; }
    ol { text-align: left; line-height: 1.6; color: #cbd5e1; font-size: 14px; }
    input { width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #475569; background: #0f172a; color: #fff; margin-top: 12px; box-sizing: border-box; }
    button { margin-top: 12px; width: 100%; padding: 10px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
    .warn { color: #fbbf24; font-size: 13px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Авторизация ${deviceModel}</h2>
    <div id="qr-section">
      <div class="qr-box">
        <img id="qr-img" width="260" height="260" alt="Ожидание QR-кода..." />
      </div>
      <ol>
        <li>Откройте <b>Telegram на телефоне</b></li>
        <li>Перейдите в <b>Настройки → Устройства → Подключить устройство</b></li>
        <li>Наведите камеру телефона на этот QR-код</li>
      </ol>
      <div class="warn">Не открывайте ссылку кликом в браузере/ПК — сканируйте именно камерой из приложения Telegram на телефоне!</div>
    </div>
    <div id="pwd-section" style="display:none;">
      <p>Введите облачный пароль 2FA от Telegram:</p>
      <input type="password" id="pwd-input" placeholder="Облачный пароль 2FA" />
      <button onclick="sendPwd()">Подтвердить</button>
    </div>
    <div id="done-section" style="display:none; color:#4ade80; font-weight:bold; margin-top:16px;">
      Авторизация успешно завершена! Сессия сохранена в .env. Можно закрыть вкладку.
    </div>
  </div>
  <script>
    let lastUrl = '';
    async function poll() {
      try {
        const r = await fetch('/state');
        const s = await r.json();
        if (s.doneAuth) {
          document.getElementById('qr-section').style.display = 'none';
          document.getElementById('pwd-section').style.display = 'none';
          document.getElementById('done-section').style.display = 'block';
          return;
        }
        if (s.need2FaPassword) {
          document.getElementById('qr-section').style.display = 'none';
          document.getElementById('pwd-section').style.display = 'block';
        } else if (s.qrUrl && s.qrUrl !== lastUrl) {
          lastUrl = s.qrUrl;
          document.getElementById('qr-img').src = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(s.qrUrl);
        }
      } catch {}
      setTimeout(poll, 1500);
    }
    async function sendPwd() {
      const password = document.getElementById('pwd-input').value;
      await fetch('/password', { method: 'POST', body: JSON.stringify({ password }) });
      document.getElementById('pwd-section').innerHTML = '<p>Проверка пароля...</p>';
    }
    poll();
  </script>
</body>
</html>`);
    });
    await new Promise<void>(resolve => qrServer!.listen(qrPort, '127.0.0.1', resolve));
    console.log('\n========================================================');
    console.log(`Откройте в браузере страницу с картинкой QR-кода:`);
    console.log(`👉  http://localhost:${qrPort}`);
    console.log('И отсканируйте QR-код КАМЕРОЙ телефона в Telegram:');
    console.log('Настройки -> Устройства -> Подключить устройство');
    console.log('(Не нажимайте на tg:// ссылку кликом — Telegram блокирует клики по ним!)');
    console.log('========================================================\n');

    await client.connect();
    await client.signInUserWithQrCode(
      { apiId, apiHash: apiHash.trim() },
      {
        qrCode: async ({ token }) => {
          currentQrUrl = `tg://login?token=${token.toString('base64url')}`;
          console.log(`[QR обновлён] Отсканируйте его на странице http://localhost:${qrPort}`);
        },
        password: async () => {
          need2FaPassword = true;
          console.log(`\nТребуется облачный пароль 2FA! Введите его на странице http://localhost:${qrPort} или здесь в терминале:`);
          return new Promise<string>((resolve) => {
            resolveWebPassword = resolve;
            void askQuestion('Enter 2FA Password: ').then((pwd) => {
              if (resolveWebPassword) {
                need2FaPassword = false;
                resolveWebPassword = null;
                resolve(pwd.trim());
              }
            });
          });
        },
        onError: (err) => console.error('QR Auth error:', err),
      },
    );
    doneAuth = true;
  } else {
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
  }

  console.log('\nAuthentication successful!');
  const sessionString = client.session.save() as unknown as string;

  console.log(`\nYour ${targetEnvKey}:`);
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
      return content.replace(regex, `${key}="${value}"`);
    }
    return content ? `${content.trim()}\n${key}="${value}"\n` : `${key}="${value}"\n`;
  };

  envContent = updateEnvKey(envContent, 'TG_API_ID', apiId.toString());
  envContent = updateEnvKey(envContent, 'TG_API_HASH', apiHash.trim());
  envContent = updateEnvKey(envContent, targetEnvKey, sessionString);
  if (phone) {
    envContent = updateEnvKey(envContent, 'TG_PHONE', phone.trim());
  }

  fs.writeFileSync(envPath, envContent, 'utf-8');
  console.log(`Saved ${targetEnvKey} and credentials to ${envPath}`);

  if (qrServer) {
    await new Promise<void>(resolve => setTimeout(resolve, 1500));
    qrServer.close();
  }
  await client.disconnect();
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during auth:', err);
  rl.close();
  process.exit(1);
});
