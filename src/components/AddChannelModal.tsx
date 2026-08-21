'use client';

import React, { useState } from 'react';
import { X, Plus, AlertCircle, Sparkles, Send } from 'lucide-react';

interface AddChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function AddChannelModal({
  isOpen,
  onClose,
  onSuccess,
}: AddChannelModalProps) {
  const [input, setInput] = useState('');
  const [isMine, setIsMine] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: input.trim(),
          isMine,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось добавить канал');
      }

      setInput('');
      setIsMine(false);
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка при обращении к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Добавить канал</h2>
            <p className="text-xs text-slate-400">Мониторинг подписчиков и постов</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Ссылка или @username
            </label>
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="@durov или https://t.me/durov"
                disabled={loading}
                className="w-full bg-slate-900/90 border border-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Поддерживаются публичные юзернеймы, прямые ссылки и инвайты в закрытые каналы (если сборщик уже состоит в них).
            </p>
          </div>

          <div className="pt-1">
            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-border/80 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={isMine}
                onChange={(e) => setIsMine(e.target.checked)}
                disabled={loading}
                className="mt-0.5 rounded border-slate-700 text-accent focus:ring-accent focus:ring-offset-0 bg-slate-800"
              />
              <div className="text-xs">
                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  Назначить «Моим каналом»
                </div>
                <div className="text-slate-400 text-[11px] mt-0.5">
                  Базовый канал, относительно которого рассчитывается разница темпов роста и активность конкурентов.
                </div>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-slate-950 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Сбор данных...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Добавить</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
