import { logger } from '../lib/logger';
import { sanitizeOperationalError } from '../lib/ops';
import {
  handleTelegramBotCommand,
  parseTelegramBotUpdate,
  type ParsedBotCommand,
  type TelegramBotCommandDeps,
  type TelegramBotUpdate,
} from '../lib/telegram-bot-commands';
import { sendTelegramRuleAlert } from './retry-policy';

const DEFAULT_POLL_TIMEOUT_SEC = 20;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_CONFLICT_DELAY_MS = 30_000;
const MAX_TELEGRAM_MESSAGE_LENGTH = 4_000;

export type BotLogger = Pick<typeof logger, 'info' | 'warn' | 'error'>;

export interface PollOnceResult {
  ok: boolean;
  conflict: boolean;
  processed: number;
  nextOffset: number;
}

export interface TelegramBotPollerOptions {
  token: string;
  initialOffset?: number;
  pollTimeoutSec?: number;
  retryDelayMs?: number;
  conflictDelayMs?: number;
  fetchImpl?: typeof fetch;
  onCommand?: (command: ParsedBotCommand) => Promise<string | null>;
  commandDeps?: TelegramBotCommandDeps;
  sendReply?: (message: string, chatId: string) => Promise<boolean>;
  log?: BotLogger;
  sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface TelegramBotPoller {
  pollOnce(): Promise<PollOnceResult>;
  start(): void;
  stop(): Promise<void>;
  getOffset(): number;
  isRunning(): boolean;
}

/** Replaces raw Telegram bot token and `/bot<token>` URL segments with `[REDACTED]`. */
export function redactBotToken(message: string, token?: string): string {
  const sanitized = sanitizeOperationalError(message, token ? [token] : [], 500) ?? '';
  let masked = sanitized.replace(/(api\.telegram\.org\/bot)(?:\[скрыто\]|[^\s/?]+)/gi, '$1[REDACTED]');
  if (token && token.length >= 4) {
    masked = masked.replaceAll(token, '[REDACTED]');
  }
  return masked;
}

function extractSafeBotError(error: unknown, token: string): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    if ('cause' in error && error.cause !== undefined) {
      parts.push(error.cause instanceof Error ? error.cause.message : String(error.cause));
    }
  } else {
    parts.push(String(error));
  }
  return redactBotToken(parts.filter(Boolean).join(': '), token) || 'Unknown error';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function splitTelegramMessage(text: string, maxLength = MAX_TELEGRAM_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt <= Math.floor(maxLength / 2)) {
      splitAt = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitAt <= 0) {
      splitAt = maxLength;
    }
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

interface GetUpdatesResponse {
  ok?: boolean;
  error_code?: number;
  description?: string;
  result?: unknown;
}

/** Creates an isolated, non-blocking Telegram Bot API `getUpdates` long-polling loop. */
export function createTelegramBotPoller(options: TelegramBotPollerOptions): TelegramBotPoller {
  const token = options.token.trim();
  const pollTimeoutSec = options.pollTimeoutSec ?? DEFAULT_POLL_TIMEOUT_SEC;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const conflictDelayMs = options.conflictDelayMs ?? DEFAULT_CONFLICT_DELAY_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sendReply = options.sendReply ?? sendTelegramRuleAlert;
  const log = options.log ?? logger;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const onCommand = options.onCommand
    ?? ((command: ParsedBotCommand) => handleTelegramBotCommand(command, options.commandDeps));

  let offset = options.initialOffset ?? 0;
  let running = false;
  let stopController: AbortController | null = null;
  let loopPromise: Promise<void> | null = null;

  async function deliverReply(text: string, chatId: string): Promise<void> {
    const chunks = splitTelegramMessage(text);
    for (const chunk of chunks) {
      await sendReply(chunk, chatId);
    }
  }

  async function pollOnce(): Promise<PollOnceResult> {
    const requestController = new AbortController();
    const requestTimeoutMs = (pollTimeoutSec + 10) * 1000;
    const timeoutId = setTimeout(() => requestController.abort(), requestTimeoutMs);

    const parentSignal = stopController?.signal;
    const onStopAbort = () => requestController.abort();
    if (parentSignal) {
      if (parentSignal.aborted) {
        clearTimeout(timeoutId);
        return { ok: false, conflict: false, processed: 0, nextOffset: offset };
      }
      parentSignal.addEventListener('abort', onStopAbort, { once: true });
    }

    try {
      const allowedUpdates = encodeURIComponent(JSON.stringify(['message']));
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=${pollTimeoutSec}&allowed_updates=${allowedUpdates}`;
      const response = await fetchImpl(url, {
        method: 'GET',
        signal: requestController.signal,
      });

      if (response.status === 409) {
        log.warn('Telegram bot getUpdates conflict (409); backing off before retry', { status: 409 });
        return { ok: false, conflict: true, processed: 0, nextOffset: offset };
      }

      if (!response.ok) {
        let detail = '';
        try {
          detail = redactBotToken(await response.text(), token);
        } catch {
          detail = '';
        }
        log.warn('Telegram bot getUpdates returned non-OK status', {
          status: response.status,
          ...(detail ? { detail } : {}),
        });
        return { ok: false, conflict: false, processed: 0, nextOffset: offset };
      }

      const payload = (await response.json()) as GetUpdatesResponse;
      if (!payload || payload.ok !== true || !Array.isArray(payload.result)) {
        const isConflict = payload?.error_code === 409;
        const safeDescription = payload?.description ? redactBotToken(String(payload.description), token) : undefined;
        log.warn('Telegram bot getUpdates returned error payload', {
          errorCode: payload?.error_code,
          ...(safeDescription ? { description: safeDescription } : {}),
        });
        return { ok: false, conflict: isConflict, processed: 0, nextOffset: offset };
      }

      let processed = 0;
      for (const rawUpdate of payload.result) {
        if (!rawUpdate || typeof rawUpdate !== 'object') continue;
        const update = rawUpdate as TelegramBotUpdate;
        if (typeof update.update_id === 'number' && Number.isFinite(update.update_id)) {
          offset = Math.max(offset, update.update_id + 1);
        }

        const command = parseTelegramBotUpdate(update);
        if (!command) continue;

        try {
          const reply = await onCommand(command);
          if (reply) {
            await deliverReply(reply, command.chatId);
          }
          processed += 1;
        } catch (err: unknown) {
          log.error('Telegram bot command handling failed', {
            commandType: command.type,
            chatId: command.chatId,
            error: extractSafeBotError(err, token),
          });
          try {
            await sendReply('⚠️ Не удалось обработать команду. Попробуйте повторить позже.', command.chatId);
          } catch {
            // Ignore secondary delivery error
          }
        }
      }

      return { ok: true, conflict: false, processed, nextOffset: offset };
    } catch (error: unknown) {
      if (parentSignal?.aborted || isAbortError(error)) {
        return { ok: false, conflict: false, processed: 0, nextOffset: offset };
      }
      log.warn('Telegram bot getUpdates request failed', {
        error: extractSafeBotError(error, token),
      });
      return { ok: false, conflict: false, processed: 0, nextOffset: offset };
    } finally {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', onStopAbort);
    }
  }

  async function runLoop(signal: AbortSignal): Promise<void> {
    log.info('Telegram bot command poller started', { pollTimeoutSec });
    while (running && !signal.aborted) {
      const result = await pollOnce();
      if (!running || signal.aborted) break;
      if (!result.ok) {
        const delayMs = result.conflict ? conflictDelayMs : retryDelayMs;
        await sleepImpl(delayMs, signal);
      }
    }
    log.info('Telegram bot command poller stopped');
  }

  function start(): void {
    if (running) return;
    if (!token) {
      log.warn('Telegram bot poller not started: empty bot token');
      return;
    }
    running = true;
    const controller = new AbortController();
    stopController = controller;
    loopPromise = runLoop(controller.signal).finally(() => {
      running = false;
      if (stopController === controller) {
        stopController = null;
      }
    });
  }

  async function stop(): Promise<void> {
    running = false;
    stopController?.abort();
    if (loopPromise) {
      await loopPromise.catch(() => {});
      loopPromise = null;
    }
  }

  return {
    pollOnce,
    start,
    stop,
    getOffset: () => offset,
    isRunning: () => running,
  };
}
