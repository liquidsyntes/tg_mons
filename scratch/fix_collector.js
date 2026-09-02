const fs = require('fs');
let content = fs.readFileSync('src/worker/collector.ts', 'utf-8');

const target = `        if (shouldDisable) {
          console.warn(\`[Collector] Disabled channel "\${channel.title}" after \${newErrors} consecutive errors.\`);
        }`;

const replacement = `        if (shouldDisable) {
          const warnText = \`[Collector] Disabled channel "\${channel.title}" after \${newErrors} consecutive errors.\`;
          console.warn(warnText);
          
          const token = process.env.TELEGRAM_BOT_TOKEN;
          const chatId = process.env.TELEGRAM_CHAT_ID;
          if (token && chatId) {
            const text = \`\\u26A0\\uFE0F <b>РљР°РЅР°Р» РѕС‚РєР»СЋС‡РµРЅ</b>\\n\\nРљР°РЅР°Р» "<b>\${channel.title}</b>" (\${channel.username ? '@' + channel.username : channel.tgId}) Р±С‹Р» Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РѕС‚РєР»СЋС‡РµРЅ РёР·-Р·Р° \${newErrors} РѕС€РёР±РѕРє РїРѕРґСЂСЏРґ.\\n\\nРџРѕСЃР»РµРґРЅСЏСЏ РѕС€РёР±РєР°:\\n<pre>\${errorMessage}</pre>\`;
            fetch(\`https://api.telegram.org/bot\${token}/sendMessage\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
            }).catch(e => console.error('[Collector] Failed to send admin alert', e));
          }
        }`;

content = content.replace(target, replacement);
fs.writeFileSync('src/worker/collector.ts', content);
console.log('done');
