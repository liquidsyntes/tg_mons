'use client';

import { useEffect, useRef, useState } from 'react';

export function TelegramAccountLink({ linked, name }: { linked: boolean; name: string | null }) {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('telegramError') === 'unavailable') {
      setError('Вход через Telegram сейчас недоступен для этого адреса сайта.');
    }
  }, []);

  useEffect(() => {
    if (started.current || new URLSearchParams(window.location.search).get('telegramLink') !== 'ready') return;
    started.current = true;
    fetch('/api/auth/telegram/link', { method: 'POST' })
      .then(async response => {
        if (!response.ok) {
          const result: { error?: string } = await response.json().catch(() => ({}));
          throw new Error(result.error || 'Не удалось привязать Telegram');
        }
        window.location.replace('/settings');
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Не удалось привязать Telegram'));
  }, []);

  return <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6 space-y-3">
    <h2 className="text-base font-bold text-white">Вход через Telegram</h2>
    {linked ? <p className="text-xs text-emerald-400">Привязан аккаунт {name || 'Telegram'}</p> : <>
      <p className="text-xs text-slate-400">Привяжите Telegram к этой учётной записи. Ваши каналы и права сохранятся.</p>
      <form action="/api/auth/telegram/start" method="post">
        <input type="hidden" name="mode" value="link" />
        <button type="submit" className="rounded-xl border border-accent/50 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent hover:bg-accent/20">
          Привязать Telegram
        </button>
      </form>
    </>}
    {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
  </section>;
}
