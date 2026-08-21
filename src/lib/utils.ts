import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return 'н/д';
  return new Intl.NumberFormat('ru-RU').format(num);
}

export function formatPercent(
  num: number | null | undefined,
  includeSign = true,
  decimals = 1
): string {
  if (num === null || num === undefined || isNaN(num)) return 'н/д';
  const sign = includeSign && num > 0 ? '+' : '';
  return `${sign}${num.toFixed(decimals)}%`;
}

export function formatDelta(
  abs: number | null | undefined,
  percent: number | null | undefined
): { text: string; percentText: string; direction: 'pos' | 'neg' | 'zero' | 'na' } {
  if (abs === null || abs === undefined || isNaN(abs)) {
    return { text: 'н/д', percentText: 'н/д', direction: 'na' };
  }
  const sign = abs > 0 ? '+' : '';
  const text = `${sign}${new Intl.NumberFormat('ru-RU').format(abs)}`;
  const percentText = percent !== null && percent !== undefined ? formatPercent(percent, true, 1) : '';
  const direction = abs > 0 ? 'pos' : abs < 0 ? 'neg' : 'zero';
  return { text, percentText, direction };
}

export function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
}

export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return 'Никогда';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'только что';
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays === 1) return 'вчера';
  if (diffDays < 30) return `${diffDays} д назад`;
  return date.toLocaleDateString('ru-RU');
}
