import { logger } from '../lib/logger';
import { updateChannelErrorState } from './persister';

export async function sendTelegramAnomalyAlert(channelTitle: string, diff: number, diffPercent: number, currentMembers: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const sign = diff > 0 ? '+' : '';
  const emoji = diff > 0 ? '🚀' : '🔻';
  const text = `${emoji} <b>Аномалия в канале "${channelTitle}"!</b>\n\nИзменение: ${sign}${diff} подписчиков (${sign}${diffPercent.toFixed(2)}%)\nТекущая аудитория: ${currentMembers}`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    logger.error('Telegram alert failed', undefined, err);
  }
}

export async function sendChannelDisabledAlert(channelTitle: string, identifier: string, errorsCount: number, errorMessage: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const text = `⚠️ <b>Канал отключен</b>\n\nКанал "<b>${channelTitle}</b>" (${identifier}) был автоматически отключен из-за ${errorsCount} ошибок подряд.\n\nПоследняя ошибка:\n<pre>${errorMessage}</pre>`;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch (err) {
    logger.error('Failed to send admin alert', undefined, err);
  }
}

export async function handleChannelError(
  channel: { id: number; title: string; username: string | null; tgId: bigint | null; consecutiveErrors: number },
  error: any
): Promise<boolean> {
  const errorMessage = error.message || String(error);
  logger.error('Channel processing failed', { title: channel.title }, new Error(errorMessage));

  const newErrors = channel.consecutiveErrors + 1;
  const shouldDisable = newErrors >= (Number(process.env.CHANNEL_MAX_CONSECUTIVE_ERRORS) || 10);

  try {
    await updateChannelErrorState(channel.id, errorMessage, newErrors, shouldDisable);
  } catch (dbErr) {
    logger.error('Could not update channel error status', undefined, dbErr);
  }

  if (shouldDisable) {
    logger.warn('Channel error threshold reached', { channelId: channel.id, title: channel.title, consecutiveErrors: newErrors });
    const identifier = channel.username ? '@' + channel.username : String(channel.tgId);
    await sendChannelDisabledAlert(channel.title, identifier, newErrors, errorMessage);
  }

  return shouldDisable;
}
