import type { LanguageBreakdownItem } from './types';

export interface Demographics {
  capturedAt: string;
  languages: LanguageBreakdownItem[];
  countries: null;
  geographyStatus: 'unsupported';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseBreakdown(value: unknown): LanguageBreakdownItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const items: LanguageBreakdownItem[] = [];
  const codes = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.code !== 'string' || !item.code.trim() ||
        typeof item.name !== 'string' || !item.name.trim() ||
        typeof item.percent !== 'number' || !Number.isFinite(item.percent) ||
        item.percent < 0 || item.percent > 100 || codes.has(item.code)) return null;
    codes.add(item.code);
    items.push({ code: item.code, name: item.name, percent: item.percent });
  }
  const total = items.reduce((sum, item) => sum + item.percent, 0);
  if (Math.abs(total - 100) > items.length * 0.05 + 0.001) return null;
  return items.sort((a, b) => b.percent - a.percent);
}

const languageCodes: Record<string, string> = {
  russian: 'ru', english: 'en', ukrainian: 'uk', german: 'de', french: 'fr',
  spanish: 'es', italian: 'it', portuguese: 'pt', arabic: 'ar', chinese: 'zh',
  japanese: 'ja', korean: 'ko', turkish: 'tr', polish: 'pl', dutch: 'nl',
  persian: 'fa', hindi: 'hi', thai: 'th', czech: 'cs', romanian: 'ro',
  hungarian: 'hu', swedish: 'sv', danish: 'da', finnish: 'fi', norwegian: 'no',
  greek: 'el', hebrew: 'he', indonesian: 'id', malay: 'ms', vietnamese: 'vi',
  uzbek: 'uz', kazakh: 'kk', belarusian: 'be', bulgarian: 'bg', serbian: 'sr',
  croatian: 'hr', other: 'other',
};

/** Use the latest common time point; never mix samples from different dates. */
export function parseLanguagesGraph(value: unknown): LanguageBreakdownItem[] | null {
  if (!isRecord(value) || !Array.isArray(value.columns) || !isRecord(value.names)) return null;
  const columns: unknown[][] = [];
  const keys = new Set<string>();
  for (const column of value.columns) {
    if (!Array.isArray(column) || column.length < 2 || typeof column[0] !== 'string' || keys.has(column[0])) return null;
    keys.add(column[0]);
    columns.push(column);
  }
  const x = columns.find(column => column[0] === 'x');
  if (!x || x.slice(1).some((time, index, times) =>
    typeof time !== 'number' || !Number.isFinite(time) || (index > 0 && Number(time) <= Number(times[index - 1])))) return null;
  const items: LanguageBreakdownItem[] = [];
  let total = 0;
  for (const column of columns) {
    const key = String(column[0]);
    if (key === 'x') continue;
    if (column.length !== x.length || column.slice(1).some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) return null;
    const name = value.names[key];
    if (typeof name !== 'string' || !name.trim()) return null;
    const amount = Number(column[column.length - 1]);
    if (amount === 0) continue;
    total += amount;
    const label = name.toLowerCase();
    const code = Object.prototype.hasOwnProperty.call(languageCodes, label) ? languageCodes[label] : key;
    items.push({ code, name, percent: amount });
  }
  if (!Number.isFinite(total) || total <= 0) return null;
  return parseBreakdown(items.map(item => ({ ...item, percent: Number((item.percent / total * 100).toFixed(1)) })));
}
