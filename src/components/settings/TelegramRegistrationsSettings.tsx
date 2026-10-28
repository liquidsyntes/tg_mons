'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserX, Ban, RotateCcw } from 'lucide-react';

type AccessStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED';

interface TelegramApplicant {
  id: number;
  telegramSub: string;
  telegramName: string | null;
  telegramUsername: string | null;
  telegramPhotoUrl: string | null;
  accessStatus: AccessStatus;
  createdAt: string;
}

const statusLabels: Record<AccessStatus, string> = {
  PENDING: 'Ожидает решения', ACTIVE: 'Доступ открыт', BLOCKED: 'В чёрном списке',
};

export function TelegramRegistrationsSettings() {
  const [users, setUsers] = useState<TelegramApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/registrations', { cache: 'no-store' });
      if (!response.ok) throw new Error('Не удалось загрузить заявки');
      const result: { users: TelegramApplicant[] } = await response.json();
      setUsers(result.users);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить заявки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: number, action: 'approve' | 'block' | 'unblock' | 'delete') => {
    if (action === 'delete' && !confirm('Удалить заявку? Человек сможет подать её снова.')) return;
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch('/api/admin/registrations', {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!response.ok) {
        const result: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Не удалось изменить заявку');
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить заявку');
    } finally {
      setBusyId(null);
    }
  };

  const ordered = [...users].sort((left, right) =>
    (left.accessStatus === 'PENDING' ? 0 : left.accessStatus === 'ACTIVE' ? 1 : 2)
    - (right.accessStatus === 'PENDING' ? 0 : right.accessStatus === 'ACTIVE' ? 1 : 2));

  return <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6 space-y-4">
    <div>
      <h2 className="text-base font-bold text-white">Заявки через Telegram</h2>
      <p className="mt-1 text-xs text-slate-400">Новые пользователи не получают доступ до вашего подтверждения.</p>
    </div>
    {loading && <p role="status" className="text-xs text-slate-400">Загрузка заявок...</p>}
    {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
    {!loading && ordered.length === 0 && <p className="text-xs text-slate-400">Заявок пока нет.</p>}
    <div className="space-y-2">
      {ordered.map(user => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-slate-900/40 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-slate-800 bg-cover bg-center"
            style={user.telegramPhotoUrl ? { backgroundImage: `url(${user.telegramPhotoUrl})` } : undefined} aria-hidden="true" />
          <div className="min-w-0 text-xs">
            <div className="font-semibold text-white">{user.telegramName || 'Имя не указано'}</div>
            <div className="text-slate-400">{user.telegramUsername ? `@${user.telegramUsername}` : 'Без публичного username'} · ID {user.telegramSub}</div>
            <div className="text-slate-500">{statusLabels[user.accessStatus]} · {new Date(user.createdAt).toLocaleDateString('ru-RU')}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.accessStatus === 'PENDING' && <>
            <button type="button" disabled={busyId === user.id} onClick={() => void act(user.id, 'approve')}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs text-emerald-400 disabled:opacity-50">
              <ShieldCheck className="h-3.5 w-3.5" /> Одобрить
            </button>
            <button type="button" disabled={busyId === user.id} onClick={() => void act(user.id, 'delete')}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-slate-300 disabled:opacity-50">
              <UserX className="h-3.5 w-3.5" /> Удалить заявку
            </button>
          </>}
          {user.accessStatus !== 'BLOCKED' ? (
            <button type="button" disabled={busyId === user.id} onClick={() => void act(user.id, 'block')}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-400 disabled:opacity-50">
              <Ban className="h-3.5 w-3.5" /> Заблокировать
            </button>
          ) : (
            <button type="button" disabled={busyId === user.id} onClick={() => void act(user.id, 'unblock')}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-slate-300 disabled:opacity-50">
              <RotateCcw className="h-3.5 w-3.5" /> Вернуть в заявки
            </button>
          )}
        </div>
      </div>)}
    </div>
  </section>;
}
