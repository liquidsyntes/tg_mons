'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';

export function ChannelListTransfer({ onImported }: { onImported: () => Promise<void> }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then(response => response.ok ? response.json() : null)
      .then((data: { user?: { role?: string } } | null) => {
        if (active) setIsAdmin(data?.user?.role === 'ADMIN');
      })
      .catch(() => { if (active) setIsAdmin(false); });
    return () => { active = false; };
  }, []);

  const importFile = async (file: File) => {
    setError(null);
    setMessage(null);
    if (file.size > 1024 * 1024) {
      setError('Файл слишком большой (максимум 1 МБ)');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/channels/list-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: await file.text(),
      });
      const result: { added?: number; alreadyPresent?: number; error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось импортировать список');
      await onImported();
      setMessage(`Добавлено: ${result.added ?? 0}, уже в списке: ${result.alreadyPresent ?? 0}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось импортировать список');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {isAdmin && (
        <a href="/api/channels/list-transfer" download className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-slate-800 px-3 py-2 font-semibold text-slate-200 hover:border-accent">
          <Download className="h-3.5 w-3.5" /> Скачать список каналов
        </a>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="Файл списка каналов"
        className="sr-only"
        onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); }}
      />
      <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-slate-800 px-3 py-2 font-semibold text-slate-200 hover:border-accent disabled:opacity-50">
        <Upload className="h-3.5 w-3.5" /> {busy ? 'Импорт...' : 'Импортировать список'}
      </button>
      {message && <span role="status" className="text-emerald-400">{message}</span>}
      {error && <span role="alert" className="text-rose-400">{error}</span>}
    </div>
  );
}
