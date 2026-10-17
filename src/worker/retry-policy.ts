import { logger } from '../lib/logger';
import { updateChannelErrorState } from './persister';

export async function sendTelegramRuleAlert(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) logger.warn('Telegram rule alert was rejected', { status: response.status });
    return response.ok;
  } catch {
    logger.warn('Telegram rule alert request failed');
    return false;
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
