export function calculateRunSuccessRate(completed: number, finished: number): number | null {
  if (finished === 0) return null;
  return Math.round((completed / finished) * 1000) / 10;
}

export function formatDurationMs(durationMs: number | null): string {
  if (durationMs === null) return 'Нет данных';
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} мин ${seconds % 60} с`;
}

export interface SyncChannelFailure {
  channelId: number;
  message: string;
}

export function sanitizeOperationalError(
  message: string | null,
  sensitiveValues: readonly (string | undefined)[] = [],
  maxLength = 500,
): string | null {
  if (message === null) return null;
  const secrets = sensitiveValues.filter((value): value is string => typeof value === 'string' && value.length >= 4);
  return secrets.reduce((text, secret) => text.replaceAll(secret, '[скрыто]'), message)
    .replace(/\b(TG_SESSION(?:_LOCAL)?|TELEGRAM_BOT_TOKEN|COLLECT_API_TOKEN|OPENROUTER_API_KEY|DATABASE_URL)\s*[:=]\s*\S+/gi, '$1=[скрыто]')
    .replace(/(api\.telegram\.org\/bot)[^/\s]+/gi, '$1[скрыто]')
    .replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function formatSyncJobErrorSummary(
  fatalError: string | null,
  failures: readonly SyncChannelFailure[],
  sensitiveValues: readonly (string | undefined)[],
): string | null {
  const safeMessage = (message: string) => sanitizeOperationalError(message, sensitiveValues, 160) ?? '';

  const parts: string[] = [];
  if (fatalError) parts.push(`Общий сбой: ${safeMessage(fatalError)}`);
  if (failures.length > 0) {
    const examples = failures.slice(0, 3).map(failure => `#${failure.channelId}: ${safeMessage(failure.message)}`);
    const remaining = failures.length > 3 ? `; ещё ${failures.length - 3}` : '';
    parts.push(`Ошибки каналов (${failures.length}): ${examples.join('; ')}${remaining}`);
  }
  return parts.length > 0 ? parts.join('. ').slice(0, 800) : null;
}
