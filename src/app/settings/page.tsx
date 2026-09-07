'use client';

import React, { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Settings, Save, AlertCircle, CheckCircle2, Server, Key, Cpu } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const [provider, setProvider] = useState('openrouter');
  const [model, setModel] = useState('meta-llama/llama-3.1-8b-instruct:free');
  const [token, setToken] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          setProvider(data.settings.aiProvider || 'openrouter');
          setModel(data.settings.aiModel || 'meta-llama/llama-3.1-8b-instruct:free');
          setToken(data.settings.aiToken || '');
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Не удалось загрузить настройки');
        setLoading(false);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiProvider: provider, aiModel: model, aiToken: token }),
      });

      if (!res.ok) {
        throw new Error('Ошибка сохранения настроек');
      }

      setSuccess('Настройки успешно сохранены');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-slate-100">
      <Header onRefresh={async () => {}} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-accent" />
            Настройки системы
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Управление параметрами приложения и интеграциями.
          </p>
        </div>

        {loading ? (
          <div className="animate-pulse flex flex-col space-y-4">
            <div className="h-40 bg-surface rounded-2xl border border-border"></div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-border/50 bg-slate-900/40 flex items-center gap-3">
              <Cpu className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">Искусственный интеллект</h2>
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
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full bg-slate-900 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono"
                />
                <p className="text-xs text-slate-500">
                  Ключ сохраняется в локальной базе данных приложения.
                </p>
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
        )}
      </main>
    </div>
  );
}
