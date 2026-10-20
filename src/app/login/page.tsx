'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { KeyRound, Loader2, UserPlus, LogIn, Shield } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

type AuthMode = 'login' | 'register' | 'master';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteParam = searchParams.get('invite') || '';

  const [mode, setMode] = useState<AuthMode>(inviteParam ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(inviteParam);
  const [accessKey, setAccessKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (inviteParam) {
      setInviteCode(inviteParam);
      setMode('register');
    }
  }, [inviteParam]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload =
        mode === 'master'
          ? { accessKey }
          : mode === 'register'
          ? { username, password, inviteCode }
          : { username, password };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(
          data.error ||
            (response.status === 401
              ? mode === 'master'
                ? 'Неверный ключ доступа'
                : 'Неверный логин или пароль'
              : 'Не удалось выполнить вход. Проверьте введенные данные.'),
        );
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
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  mode === 'login' ? 'bg-accent text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Вход
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(null); }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  mode === 'register' ? 'bg-accent text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                По инвайту
              </button>
              <button
                type="button"
                onClick={() => { setMode('master'); setError(null); }}
                title="Вход по серверному мастер-ключу"
                className={`px-2 py-1 rounded-lg font-medium transition-colors ${
                  mode === 'master' ? 'bg-accent text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Ключ
              </button>
            </div>
          </div>

          <h1 className="text-xl font-bold text-white">
            {mode === 'register'
              ? 'Регистрация по инвайту'
              : mode === 'master'
              ? 'Вход по мастер-ключу'
              : 'Вход в TG Monitor'}
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            {mode === 'register'
              ? 'Создайте личный аккаунт для работы со своим списком каналов. Для первого аккаунта администратора можно указать серверный ключ.'
              : mode === 'master'
              ? 'Введите ключ доступа, заданный для COLLECT_API_TOKEN на сервере.'
              : 'Введите ваш логин и пароль для доступа к персональному дашборду.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'master' ? (
            <div className="space-y-1.5">
              <label htmlFor="access-key" className="block text-xs font-medium text-slate-300">
                Ключ доступа
              </label>
              <input
                id="access-key"
                type="password"
                value={accessKey}
                onChange={(event) => setAccessKey(event.target.value)}
                autoComplete="off"
                required
                className="w-full bg-slate-900 border border-border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="username" className="block text-xs font-medium text-slate-300">
                  Логин
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="например: alex"
                  autoComplete="username"
                  required
                  className="w-full bg-slate-900 border border-border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-medium text-slate-300">
                  Пароль
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Минимум 6 символов"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  required
                  className="w-full bg-slate-900 border border-border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>

              {mode === 'register' && (
                <div className="space-y-1.5">
                  <label htmlFor="invite-code" className="block text-xs font-medium text-slate-300">
                    Инвайт-код
                  </label>
                  <input
                    id="invite-code"
                    type="text"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                    placeholder="TGMON-XXXX-XXXX"
                    autoComplete="off"
                    required
                    className="w-full bg-slate-900 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'register' ? (
              <UserPlus className="w-4 h-4" />
            ) : mode === 'master' ? (
              <Shield className="w-4 h-4" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            {mode === 'register' ? 'Создать аккаунт' : 'Войти'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <LoginForm />
    </Suspense>
  );
}
