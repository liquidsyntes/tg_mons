'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Clock3, Save, Send } from 'lucide-react';

interface PersonalDigestView {
  id: number;
  telegramChatId: string | null;
  digestEnabled: boolean;
  digestHour: number;
  lastDigestAt: string | null;
}

interface PersonalDigestResponse {
  digest: PersonalDigestView | null;
  available: boolean;
  botConfigured: boolean;
}

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : fallback;
    throw new Error(message);
  }
  return data as T;
}

export function PersonalDigestSettings() {
  const [available, setAvailable] = useState(true);
  const [botConfigured, setBotConfigured] = useState(true);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestHour, setDigestHour] = useState(9);
  const [lastDigestAt, setLastDigestAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/digest')
      .then(response => readResponse<PersonalDigestResponse>(response, 'Не удалось загрузить настройки дайджеста'))
      .then(data => {
        setAvailable(data.available);
        setBotConfigured(data.botConfigured);
        if (data.digest) {
          setTelegramChatId(data.digest.telegramChatId ?? '');
          setDigestEnabled(data.digest.digestEnabled);
          setDigestHour(data.digest.digestHour);
          setLastDigestAt(data.digest.lastDigestAt);
        }
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Не удалось загрузить настройки дайджеста'))
      .finally(() => setLoading(false));
  }, []);

  async function savePersonalDigest(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/settings/digest', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramChatId: telegramChatId.trim(),
          digestEnabled,
          digestHour,
        }),
      });
      const data = await readResponse<{ digest: PersonalDigestView }>(
        response,
        'Не удалось сохранить настройки дайджеста',
      );
      setTelegramChatId(data.digest.telegramChatId ?? '');
      setDigestEnabled(data.digest.digestEnabled);
      setDigestHour(data.digest.digestHour);
      setLastDigestAt(data.digest.lastDigestAt);
      setSuccess('Настройки персонального дайджеста сохранены');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить настройки дайджеста');
    } finally {
      setSaving(false);
    }
  }

  if (!loading && !available) {
    return null;
  }

  return (
    <section className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-border/50 bg-slate-900/40 flex items-center gap-3">
        <Send className="w-5 h-5 text-accent" />
        <div>
          <h2 className="text-lg font-semibold text-white">Персональный Telegram-дайджест</h2>
          <p className="text-xs text-slate-400 mt-1">
            Ежедневная сводка только по вашим активным каналам («Мой канал», лидеры роста и падения) в личный Telegram-чат.
          </p>
        </div>
      </div>

      <form onSubmit={savePersonalDigest} className="p-6 space-y-5">
        {!botConfigured && !loading && (
          <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            Токен Telegram-бота (`TELEGRAM_BOT_TOKEN`) пока не настроен на сервере. Настройки можно сохранить заранее.
          </p>
        )}
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        {success && <p role="status" className="text-sm text-emerald-400">{success}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-medium text-slate-300">
            <span>Ваш Telegram Chat ID</span>
            <input
              type="text"
              maxLength={64}
              value={telegramChatId}
              onChange={event => setTelegramChatId(event.target.value)}
              disabled={loading || saving}
              placeholder="Например: 123456789 или -1001234567890"
              className="w-full bg-slate-900 border border-border rounded-lg px-3 py-2.5 text-sm text-white font-mono"
            />
          </label>

          <label className="space-y-1.5 text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1.5">
              <Clock3 className="w-3.5 h-3.5 text-slate-400" />
              Час отправки (UTC)
            </span>
            <select
              value={digestHour}
              onChange={event => setDigestHour(Number(event.target.value))}
              disabled={loading || saving}
              className="w-full bg-slate-900 border border-border rounded-lg px-3 py-2.5 text-sm text-white"
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00 UTC</option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={digestEnabled}
            onChange={event => setDigestEnabled(event.target.checked)}
            disabled={loading || saving}
            className="h-4 w-4 accent-indigo-400"
          />
          Включить ежедневную отправку персонального дайджеста
        </label>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-border/50">
          <p className="text-xs text-slate-400">
            Последняя успешная доставка:{' '}
            {lastDigestAt
              ? `${new Date(lastDigestAt).toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC`
              : 'Ещё не отправлялся'}
          </p>
          <button
            type="submit"
            disabled={loading || saving}
            className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-950"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : 'Сохранить дайджест'}
          </button>
        </div>
      </form>
    </section>
  );
}
