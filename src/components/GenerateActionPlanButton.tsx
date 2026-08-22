'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListTodo, Loader2 } from 'lucide-react';

interface Props {
  reportId: number;
}

export function GenerateActionPlanButton({ reportId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/action-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка при генерации плана');
      
      if (json.reportId) {
        router.push(`/reports/${json.reportId}`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8">
      {error && (
        <div className="mb-4 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-400 text-sm">
          {error}
        </div>
      )}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Формируем руководство...
          </>
        ) : (
          <>
            <ListTodo className="w-5 h-5" />
            Сформировать пошаговый план действий
          </>
        )}
      </button>
    </div>
  );
}
