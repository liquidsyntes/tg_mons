import type { ChannelMetrics } from './types';

export type ExportValue = string | number | boolean | null | undefined;
export type ExportRow = Record<string, ExportValue>;
export interface ExportColumn { key: string; label: string; quoteAlways?: boolean }

const BOM = '\uFEFF';

function csvCell(value: ExportValue, quoteAlways = false): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return String(value);
  const protectedText = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) ? `'${value}` : value;
  const escaped = protectedText.replace(/"/g, '""');
  return quoteAlways || /[",\r\n]/u.test(escaped) ? `"${escaped}"` : escaped;
}

export function serializeCsv(columns: ExportColumn[], rows: ExportRow[], bom = true): string {
  const lines = [
    columns.map(column => csvCell(column.label)).join(','),
    ...rows.map(row => columns.map(column => csvCell(row[column.key], column.quoteAlways)).join(',')),
  ];
  return `${bom ? BOM : ''}${lines.join('\r\n')}`;
}

export function serializeJson(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

export function formatChannelTelegramUrl(username: string | null | undefined): string {
  if (!username) return '';
  const cleaned = username.trim().replace(/^(?:https?:\/\/)?(?:t\.me\/|@)+/i, '').replace(/\/+$/, '');
  return cleaned ? `https://t.me/${cleaned}` : '';
}

export const channelExportColumns: ExportColumn[] = [
  { key: 'title', label: 'Название', quoteAlways: true },
  { key: 'username', label: 'Username' },
  { key: 'url', label: 'Ссылка' },
  { key: 'members', label: 'Подписчики' },
  { key: 'delta24hAbs', label: 'Δ 24ч (чел)' },
  { key: 'delta24hPct', label: 'Δ 24ч (%)' },
  { key: 'delta7dAbs', label: 'Δ 7д (чел)' },
  { key: 'delta7dPct', label: 'Δ 7д (%)' },
  { key: 'delta30dAbs', label: 'Δ 30д (чел)' },
  { key: 'delta30dPct', label: 'Δ 30д (%)' },
  { key: 'posts7d', label: 'Постов (7д)' },
  { key: 'posts30d', label: 'Постов (30д)' },
  { key: 'avgViews7d', label: 'Просм. (avg 7д)' },
  { key: 'vr7d', label: 'VR (7д, %)' },
  { key: 'er7d', label: 'ER (7д, %)' },
  { key: 'err7d', label: 'ERR (7д, %)' },
  { key: 'citationIndex', label: 'ИЦ (30д)' },
  { key: 'audienceSharePercent', label: 'Моя доля (%)' },
];

export function channelExportRows(channels: ChannelMetrics[]): ExportRow[] {
  return channels.map(channel => ({
    title: channel.title,
    username: channel.username ? `@${channel.username.trim().replace(/^@/, '')}` : '',
    url: formatChannelTelegramUrl(channel.username),
    members: channel.currentMembers,
    delta24hAbs: channel.delta24h.abs,
    delta24hPct: channel.delta24h.percent,
    delta7dAbs: channel.delta7d.abs,
    delta7dPct: channel.delta7d.percent,
    delta30dAbs: channel.delta30d.abs,
    delta30dPct: channel.delta30d.percent,
    posts7d: channel.posts7d,
    posts30d: channel.posts30d,
    avgViews7d: channel.avgViews7d,
    vr7d: channel.vr7d,
    er7d: channel.er7d,
    err7d: channel.err7d,
    citationIndex: channel.citationIndex ?? null,
    audienceSharePercent: channel.comparison?.audienceSharePercent ?? null,
  }));
}

export function serializeChannelsCsv(channels: ChannelMetrics[], bom = true): string {
  return serializeCsv(channelExportColumns, channelExportRows(channels), bom);
}

export function serializeChannelsJson(channels: ChannelMetrics[]): string {
  return serializeJson(channelExportRows(channels));
}

export const dailyExportColumns: ExportColumn[] = [
  { key: 'date', label: 'Дата' },
  { key: 'followers', label: 'Подписчики' },
  { key: 'postsCount', label: 'Постов' },
  { key: 'avgViews', label: 'Средние просмотры' },
  { key: 'vr', label: 'VR (%)' },
  { key: 'err', label: 'ERR (%)' },
];

export const snapshotExportColumns: ExportColumn[] = [
  { key: 'collectedAt', label: 'Время снимка' },
  { key: 'membersCount', label: 'Подписчики' },
];

export const postExportColumns: ExportColumn[] = [
  { key: 'messageId', label: 'ID поста Telegram' },
  { key: 'publishedAt', label: 'Дата публикации' },
  { key: 'text', label: 'Текст' },
  { key: 'views', label: 'Просмотры' },
  { key: 'reactions', label: 'Реакции' },
  { key: 'comments', label: 'Комментарии' },
  { key: 'forwards', label: 'Пересылки' },
  { key: 'isAd', label: 'Реклама' },
  { key: 'contentType', label: 'Тип контента' },
];
