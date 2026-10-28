'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock3 } from 'lucide-react';

export default function PendingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const checkStatus = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!response.ok) {
        router.replace(response.status === 403 ? '/login?telegramError=blocked' : '/login');
        return;
      }
      const result: { user?: { accessStatus?: string } } = await response.json();
      if (result.user?.accessStatus === 'ACTIVE') {
        router.replace('/');
        router.refresh();
      } else {
        setMessage('Заявка ещё ожидает решения администратора.');
      }
    } catch {
      setMessage('Не удалось проверить статус. Попробуйте ещё раз.');
    } finally {
      setChecking(false);
    }
  };

  return <main className="min-h-screen bg-background px-4 text-slate-100 flex items-center justify-center">
    <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 space-y-5 text-center">
      <Clock3 className="mx-auto h-8 w-8 text-accent" />
      <h1 className="text-xl font-bold">Заявка отправлена</h1>
      <p className="text-sm text-slate-400">Ваш Telegram-аккаунт подтверждён. Администратор решит, открыть ли доступ к TG Monitor.</p>
      {message && <p role="status" className="text-xs text-slate-400">{message}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" disabled={checking} onClick={() => void checkStatus()}
          className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">
          {checking ? 'Проверка...' : 'Проверить статус'}
        </button>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="rounded-xl border border-border px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">Выйти</button>
        </form>
      </div>
    </div>
  </main>;
}
