'use client';

import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [accessKey, setAccessKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey }),
      });
      if (!response.ok) {
        setError(response.status === 401 ? 'Неверный ключ доступа' : 'Не удалось войти. Проверьте настройки сервера.');
        return;
      }
      setAccessKey('');
      router.replace('/');
      router.refresh();
    } catch {
      setError('Не удалось связаться с сервером');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 text-slate-100 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-surface border border-border rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="space-y-2">
          <KeyRound className="w-7 h-7 text-accent" />
          <h1 className="text-xl font-bold text-white">Вход в TG Monitor</h1>
          <p className="text-sm text-slate-400">Введите ключ доступа, заданный для COLLECT_API_TOKEN на сервере.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="access-key" className="block text-sm font-medium text-slate-300">Ключ доступа</label>
          <input
            id="access-key"
            type="password"
            value={accessKey}
            onChange={event => setAccessKey(event.target.value)}
            autoComplete="off"
            required
            className="w-full bg-slate-900 border border-border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <button type="submit" disabled={submitting} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-accent-hover disabled:opacity-50">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Войти
        </button>
      </form>
    </main>
  );
}
