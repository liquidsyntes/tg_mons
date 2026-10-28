'use client';

import React, { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { AlertRulesSettings } from '@/components/settings/AlertRulesSettings';
import { TelegramRegistrationsSettings } from '@/components/settings/TelegramRegistrationsSettings';
import { TelegramAccountLink } from '@/components/settings/TelegramAccountLink';
import { OperationsMonitorSettings } from '@/components/settings/OperationsMonitorSettings';
import { PersonalDigestSettings } from '@/components/settings/PersonalDigestSettings';
import { Settings, Save, AlertCircle, CheckCircle2, Server, Key, Cpu, Shield, User, Clock3 } from 'lucide-react';
import Link from 'next/link';
import type { FormEvent } from 'react';

interface SettingsView {
  aiProvider: string;
  aiModel: string;
  hasToken: boolean;
  tokenPreview: string | null;
  tokenSource: 'saved' | 'environment' | null;
  digestEnabled: boolean;
  digestHour: number;
  lastDigestAt: string | null;
}

interface CurrentUser {
  id: number | null;
  username: string;
  role: 'ADMIN' | 'USER';
  telegramLinked?: boolean;
  telegramName?: string | null;
}

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [provider, setProvider] = useState('openrouter');
  const [model, setModel] = useState('z-ai/glm-5.3-flash');
  const [token, setToken] = useState('');
  const [tokenStatus, setTokenStatus] = useState<Pick<SettingsView, 'hasToken' | 'tokenPreview' | 'tokenSource'>>({
    hasToken: false, tokenPreview: null, tokenSource: null,
  });
  const [clearToken, setClearToken] = useState(false);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestHour, setDigestHour] = useState(9);
  const [lastDigestAt, setLastDigestAt] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then(res => (res.ok ? res.json() : null)),
      fetch('/api/auth/me').then(res => (res.ok ? res.json() : null)),
    ])
      .then(([settingsData, meData]) => {
        if (!settingsData?.settings || !meData?.user) throw new Error('Не удалось загрузить настройки');
        const settings = settingsData.settings as SettingsView;
        setProvider(settings.aiProvider || 'openrouter');
        setModel(settings.aiModel || 'z-ai/glm-5.3-flash');
        setTokenStatus({ hasToken: settings.hasToken, tokenPreview: settings.tokenPreview, tokenSource: settings.tokenSource });
        setDigestEnabled(settings.digestEnabled);
        setDigestHour(settings.digestHour);
        setLastDigestAt(settings.lastDigestAt);
        setCurrentUser(meData.user as CurrentUser);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Не удалось загрузить настройки');
        setLoading(false);
      });
  }, []);

  const isAdmin = currentUser?.role === 'ADMIN';

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiProvider: provider,
          aiModel: model,
          digestEnabled,
          digestHour,
          ...(clearToken ? { clearToken: true } : token.trim() ? { aiToken: token.trim() } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка сохранения настроек');
      }

      const data = await res.json();
      const settings = data.settings as SettingsView;
      setTokenStatus({ hasToken: settings.hasToken, tokenPreview: settings.tokenPreview, tokenSource: settings.tokenSource });
      setDigestEnabled(settings.digestEnabled);
      setDigestHour(settings.digestHour);
      setLastDigestAt(settings.lastDigestAt);
      setToken('');
      setClearToken(false);
      setSuccess('Настройки успешно сохранены');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-slate-100">
      <Header onRefresh={async () => {}} />

      <main className="flex-1 site-shell w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Settings className="w-6 h-6 text-accent" />
              Настройки системы
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Управление параметрами приложения, заявками и уведомлениями.
            </p>
          </div>

          {currentUser && (
            <div className="inline-flex items-center gap-2.5 bg-surface border border-border rounded-xl px-4 py-2 text-xs">
              {currentUser.role === 'ADMIN' ? (
                <Shield className="w-4 h-4 text-amber-400" />
              ) : (
                <User className="w-4 h-4 text-accent" />
              )}
              <span className="text-slate-300">
                Аккаунт: <strong className="text-white">{currentUser.telegramName || `@${currentUser.username}`}</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] uppercase">
                {currentUser.role === 'ADMIN' ? 'Админ' : 'Пользователь'}
              </span>
            </div>
          )}
        </div>

        {!loading && !currentUser && error && (
          <div className="text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 text-sm">
            {error}
          </div>
        )}

        {currentUser?.id && <TelegramAccountLink linked={Boolean(currentUser.telegramLinked)} name={currentUser.telegramName ?? null} />}
        {isAdmin && <TelegramRegistrationsSettings />}

        {loading ? (
          <div className="animate-pulse flex flex-col space-y-4">
            <div className="h-40 bg-surface rounded-2xl border border-border"></div>
          </div>
        ) : isAdmin ? (
          <form onSubmit={handleSave} className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-border/50 bg-slate-900/40 flex items-center gap-3">
              <Cpu className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">Искусственный интеллект (Общий ключ)</h2>
            </div>
            
            <div className="p-6 space-y-6">
              {error && (
                <div className="flex items-center gap-2 text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              
              {success && (
                <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20 text-sm">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {/* Provider Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-slate-500" />
                  Провайдер ИИ
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full bg-slate-900 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50 appearance-none"
                >
                  <option value="openrouter">OpenRouter (Рекомендуется)</option>
                  <option value="openai" disabled>OpenAI (Скоро)</option>
                  <option value="anthropic" disabled>Anthropic (Скоро)</option>
                </select>
                <p className="text-xs text-slate-500">
                  Через OpenRouter доступны сотни моделей, включая бесплатные варианты Llama, Google и др.
                </p>
              </div>

              {/* API Token */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-slate-500" />
                  API Токен
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => { setToken(e.target.value); setClearToken(false); }}
                  placeholder="Введите новый ключ"
                  disabled={clearToken}
                  className="w-full bg-slate-900 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono"
                />
                <p className="text-xs text-slate-500">
                  {clearToken ? 'Сохранённый ключ будет удалён после сохранения настроек.' : tokenStatus.hasToken
                    ? `Ключ установлен (${tokenStatus.tokenPreview}). Источник: ${tokenStatus.tokenSource === 'saved' ? 'настройки' : 'окружение'}. Оставьте поле пустым, чтобы сохранить его.`
                    : 'Ключ не установлен. Новый ключ будет сохранён в базе данных.'}
                </p>
                {tokenStatus.tokenSource === 'saved' && (
                  <button type="button" onClick={() => { setClearToken(!clearToken); setToken(''); }}
                    className="text-xs text-rose-400 hover:text-rose-300">
                    {clearToken ? 'Отменить очистку ключа' : 'Удалить сохранённый ключ'}
                  </button>
                )}
              </div>

              {/* Model */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-slate-500" />
                  Используемая Модель
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="meta-llama/llama-3.1-8b-instruct:free"
                  className="w-full bg-slate-900 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono"
                />
                <p className="text-xs text-slate-500">
                  Идентификатор модели (например: <code>meta-llama/llama-3.1-8b-instruct:free</code>, <code>google/gemini-flash-1.5-exp</code>)
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-border/50 space-y-5">
              <div className="flex items-center gap-3">
                <Clock3 className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-semibold text-white">Ежедневный Telegram-дайджест</h2>
              </div>
              <label className="flex items-center gap-3 text-sm text-slate-300">
                <input type="checkbox" checked={digestEnabled} onChange={e => setDigestEnabled(e.target.checked)}
                  className="h-4 w-4 accent-indigo-400" />
                Включить ежедневную отправку
              </label>
              <div className="space-y-2">
                <label htmlFor="digest-hour" className="block text-sm font-medium text-slate-300">Час отправки (UTC)</label>
                <select id="digest-hour" value={digestHour} onChange={e => setDigestHour(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50">
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00 UTC</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-400">
                Последняя успешная отправка: {lastDigestAt
                  ? `${new Date(lastDigestAt).toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC`
                  : 'Ещё не отправлялся'}
              </p>
            </div>

            <div className="p-6 bg-slate-900/40 border-t border-border/50 flex justify-end gap-3">
              <Link 
                href="/"
                className="px-5 py-2.5 rounded-xl bg-surface border border-border hover:bg-slate-800 text-sm font-medium text-slate-300 transition-colors"
              >
                Отмена
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-sm font-bold transition-colors shadow-lg shadow-accent/10"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Сохранение...' : 'Сохранить настройки'}
              </button>
            </div>
          </form>
        ) : null}
        {isAdmin && <OperationsMonitorSettings />}
        <PersonalDigestSettings />
        <AlertRulesSettings />
      </main>
    </div>
  );
}
