'use client';

import React, { Suspense, useState } from 'react';
import { KeyRound, Loader2, LogIn, Shield } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

type AuthMode = 'login' | 'master';

const telegramErrors: Record<string, string> = {
  blocked: 'Этот Telegram-аккаунт заблокирован администратором.',
  invalid: 'Подтверждение входа через Telegram истекло или недействительно. Повторите попытку.',
  failed: 'Не удалось подтвердить вход через Telegram. Повторите попытку.',
  unavailable: 'Вход через Telegram сейчас недоступен.',
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const telegramError = searchParams.get('telegramError');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = mode === 'master' ? { accessKey } : { username, password };
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Не удалось выполнить вход. Проверьте введённые данные.');
        return;
      }
      setPassword('');
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
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <KeyRound className="w-7 h-7 text-accent" />
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-border text-xs">
              <button type="button" onClick={() => { setMode('login'); setError(null); }}
                className={`px-2.5 py-1 rounded-lg font-medium ${mode === 'login' ? 'bg-accent text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}>Вход</button>
              <button type="button" onClick={() => { setMode('master'); setError(null); }}
                title="Вход по серверному мастер-ключу"
                className={`px-2.5 py-1 rounded-lg font-medium ${mode === 'master' ? 'bg-accent text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}>Ключ</button>
            </div>
          </div>
          <h1 className="text-xl font-bold text-white">{mode === 'master' ? 'Вход по мастер-ключу' : 'Вход в TG Monitor'}</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            {mode === 'master' ? 'Резервный вход администратора.' : 'Войдите через Telegram или используйте существующий логин и пароль.'}
          </p>
        </div>

        {mode === 'login' && (
          <>
            <form action="/api/auth/telegram/start" method="post">
              <input type="hidden" name="mode" value="login" />
              <button type="submit" className="w-full rounded-xl border border-accent/50 bg-accent/10 px-4 py-2.5 text-sm font-bold text-accent hover:bg-accent/20">
                Продолжить через Telegram
              </button>
            </form>
            <p className="text-xs text-slate-400">Новый пользователь отправит заявку. Доступ появится после подтверждения администратором.</p>
            <div className="border-t border-border pt-4 text-xs text-slate-500">Вход для существующих аккаунтов</div>
          </>
        )}

        {(error || telegramError) && (
          <p role="alert" className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-2.5">
            {error || telegramErrors[telegramError || ''] || 'Не удалось выполнить вход через Telegram.'}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'master' ? (
            <div className="space-y-1.5">
              <label htmlFor="access-key" className="block text-xs font-medium text-slate-300">Ключ доступа</label>
              <input id="access-key" type="password" value={accessKey} onChange={event => setAccessKey(event.target.value)}
                autoComplete="off" required className="w-full bg-slate-900 border border-border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="username" className="block text-xs font-medium text-slate-300">Логин</label>
                <input id="username" type="text" value={username} onChange={event => setUsername(event.target.value)}
                  autoComplete="username" required className="w-full bg-slate-900 border border-border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-medium text-slate-300">Пароль</label>
                <input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)}
                  autoComplete="current-password" required className="w-full bg-slate-900 border border-border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50" />
              </div>
            </>
          )}
          <button type="submit" disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-accent-hover disabled:opacity-50">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'master' ? <Shield className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            Войти
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="min-h-screen bg-background" />}><LoginForm /></Suspense>;
}
