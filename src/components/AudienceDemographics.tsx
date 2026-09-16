'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { isRecord, parseBreakdown, type Demographics } from '@/lib/demographics';

type State = { channelId: number; status: 'loading' | 'empty' | 'error' } |
  { channelId: number; status: 'ready'; data: Demographics; stale: boolean };

export function AudienceDemographics({ channelId }: { channelId: number }): ReactElement {
  const [state, setState] = useState<State>({ channelId, status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ channelId, status: 'loading' });
    async function load(): Promise<void> {
      try {
        const response = await fetch(`/api/stats/demographics/${channelId}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Request failed');
        const body: unknown = await response.json();
        if (!isRecord(body)) throw new Error('Invalid response');
        if (controller.signal.aborted) return;
        if (body.demographics === null) {
          setState({ channelId, status: 'empty' });
          return;
        }
        const data = body.demographics;
        if (!isRecord(data) || typeof data.capturedAt !== 'string' || !Number.isFinite(Date.parse(data.capturedAt))) throw new Error('Invalid snapshot');
        const languages = parseBreakdown(data.languages);
        if (!languages || data.countries !== null || data.geographyStatus !== 'unsupported') throw new Error('Invalid breakdown');
        setState({ channelId, status: 'ready', stale: Date.now() - Date.parse(data.capturedAt) > 7 * 86400000, data: {
          capturedAt: data.capturedAt, languages, countries: null, geographyStatus: 'unsupported',
        } });
      } catch {
        if (!controller.signal.aborted) setState({ channelId, status: 'error' });
      }
    }
    void load();
    return () => controller.abort();
  }, [channelId]);
  const current = state.channelId === channelId ? state : { status: 'loading' as const };
  return (
    <div className="mt-4 pt-4 border-t border-border/50 space-y-2 relative z-10" aria-live="polite">
      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Языки аудитории</span>
      {current.status === 'loading' && <p className="text-xs text-slate-400">Загрузка демографии…</p>}
      {current.status === 'empty' && <p className="text-xs text-slate-400">Демография пока недоступна. Сбор выполняется еженедельно, если Telegram предоставляет доступ к статистике.</p>}
      {current.status === 'error' && <p className="text-xs text-amber-400">Не удалось загрузить демографию.</p>}
      {current.status === 'ready' && <>
        <div className="flex flex-wrap gap-2">
          {current.data.languages.slice(0, 3).map(language => (
            <span key={language.code} title={language.name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/50 text-xs text-slate-300">
              <span>{language.name}</span><span>{language.percent}%</span>
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          Снимок: {new Date(current.data.capturedAt).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}
          {current.stale && ' · Данные старше недели'}
        </p>
      </>}
      <p className="text-xs text-slate-500">География недоступна через Telegram API.</p>
    </div>
  );
}
