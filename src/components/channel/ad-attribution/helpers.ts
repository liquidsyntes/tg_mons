import type {
  AdPlacementFormat,
  AdPlacementStatus,
  AdPriceSource,
} from '@/lib/types';

/** Направление атрибуции: inbound - закупки (входящие упоминания), outbound - отдача рекламы */
export type Direction = 'inbound' | 'outbound';

export const numberFormat = new Intl.NumberFormat('ru-RU');
export const moneyFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export const PRICE_LABELS: Record<AdPriceSource, string> = {
  custom_price: 'Указанная цена',
  custom_cpm: 'Ваш CPM',
  niche_estimate: 'Оценка по нише',
};

export const FORMAT_LABELS: Record<AdPlacementFormat, string> = {
  '1/24': '1/24 (1ч топ / 24ч лента)',
  '2/48': '2/48 (2ч топ / 48ч лента)',
  '3/72': '3/72 (3ч топ / 72ч лента)',
  native: 'Нативная интеграция',
  eternal: 'Без удаления',
};

export const FORMAT_SHORT_LABELS: Record<AdPlacementFormat, string> = {
  '1/24': '1/24',
  '2/48': '2/48',
  '3/72': '3/72',
  native: 'Натив',
  eternal: 'Без удаления',
};

export const STATUS_LABELS: Record<AdPlacementStatus, string> = {
  planned: 'Запланировано',
  published: 'Опубликовано',
  completed: 'Завершено',
  cancelled: 'Отменено',
};

export const STATUS_BADGE_CLASSES: Record<AdPlacementStatus, string> = {
  planned: 'bg-sky-500/15 text-sky-300',
  published: 'bg-indigo-500/15 text-indigo-300',
  completed: 'bg-emerald-500/15 text-emerald-300',
  cancelled: 'bg-slate-800 text-slate-400 line-through',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  UAH: '₴',
  RUB: '₽',
  USD: '$',
  EUR: '€',
};

export function formatDelta(value: number | null): string {
  return value === null ? 'н/д' : `${value > 0 ? '+' : ''}${numberFormat.format(value)}`;
}

export function formatMoney(value: number | null, currency = 'UAH'): string {
  if (value === null) return 'н/д';
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency;
  return `${moneyFormat.format(value)} ${symbol}`;
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
