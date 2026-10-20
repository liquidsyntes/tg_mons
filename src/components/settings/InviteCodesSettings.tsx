'use client';

import React, { useEffect, useState } from 'react';
import { Users, Plus, Copy, Check, Trash2, Ticket, Shield, User as UserIcon } from 'lucide-react';

interface InviteItem {
  id: number;
  code: string;
  usedAt: string | null;
  createdAt: string;
  usedBy: { id: number; username: string } | null;
}

interface UserItem {
  id: number;
  username: string;
  role: string;
  createdAt: string;
  _count: { userChannels: number };
}

export function InviteCodesSettings() {
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = await fetch('/api/invites');
      if (!res.ok) return;
      const data = await res.json();
      setInvites(data.invites || []);
      setUsers(data.users || []);
    } catch {
      setError('Не удалось загрузить список инвайтов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateInvite = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/invites', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Не удалось создать инвайт');
      }
      const data = await res.json();
      if (data.invite) {
        setInvites((prev) => [data.invite, ...prev]);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания инвайта');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteInvite = async (id: number) => {
    try {
      const res = await fetch('/api/invites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setInvites((prev) => prev.filter((item) => item.id !== id));
      }
    } catch {
      setError('Не удалось удалить инвайт');
    }
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6 animate-pulse h-36" />
    );
  }

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-border/50 bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-accent" />
          <div>
            <h2 className="text-lg font-semibold text-white">Пользователи и инвайт-коды</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Создавайте одноразовые инвайты для приглашения своих людей в систему
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCreateInvite}
          disabled={creating}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-slate-950 text-xs font-bold transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          {creating ? 'Создание...' : 'Создать инвайт-код'}
        </button>
      </div>

      <div className="p-6 space-y-6">
        {error && (
          <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
            {error}
          </div>
        )}

        {/* Invites List */}
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Ticket className="w-3.5 h-3.5 text-accent" />
            Инвайт-коды ({invites.length})
          </div>

          {invites.length === 0 ? (
            <div className="text-xs text-slate-500 bg-slate-900/40 border border-border/50 rounded-xl p-4">
              Инвайт-кодов пока нет. Нажмите «Создать инвайт-код», чтобы сгенерировать код или ссылку для регистрации.
            </div>
          ) : (
            <div className="space-y-2">
              {invites.map((inv) => {
                const isUsed = Boolean(inv.usedBy);
                const inviteLink =
                  typeof window !== 'undefined'
                    ? `${window.location.origin}/login?invite=${encodeURIComponent(inv.code)}`
                    : `/login?invite=${encodeURIComponent(inv.code)}`;

                return (
                  <div
                    key={inv.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 border border-border/60 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <code className="text-sm font-mono font-bold text-white bg-slate-950 px-2.5 py-1 rounded border border-border">
                        {inv.code}
                      </code>
                      {isUsed ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-border">
                          Использован: <strong className="text-slate-200">@{inv.usedBy?.username}</strong>
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          Активен
                        </span>
                      )}
                    </div>

                    {!isUsed && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyText(`code-${inv.id}`, inv.code)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-border transition-colors"
                        >
                          {copiedKey === `code-${inv.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>Код</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => copyText(`link-${inv.id}`, inviteLink)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-border transition-colors"
                        >
                          {copiedKey === `link-${inv.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>Ссылка</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteInvite(inv.id)}
                          title="Удалить инвайт"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-border transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Users List */}
        <div className="space-y-3 pt-2 border-t border-border/40">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5 text-accent" />
            Зарегистрированные аккаунты ({users.length})
          </div>

          {users.length === 0 ? (
            <div className="text-xs text-slate-500">Пользователи еще не созданы.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between bg-slate-900/60 border border-border/60 rounded-xl px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {u.role === 'ADMIN' ? (
                      <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <UserIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span className="text-sm font-medium text-white truncate">@{u.username}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400 font-mono">
                      {u._count?.userChannels ?? 0} кан.
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        u.role === 'ADMIN'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-300 border border-border'
                      }`}
                    >
                      {u.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
