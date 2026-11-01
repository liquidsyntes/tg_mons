'use client';

import type { ReactNode } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { AILoadingStatus } from '@/components/AILoadingStatus';

interface AIReportCardShellProps {
  containerClassName: string;
  buttonClassName: string;
  accentClassName: string;
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  buttonLabel: string;
  loadingLabel: string;
  loading: boolean;
  success: boolean;
  onSuccessClear: () => void;
  onGenerate: () => void;
  messages: string[];
  error: string | null;
  result: ReactNode;
  onDownload: () => void;
}

export function AIReportCardShell({
  containerClassName, buttonClassName, accentClassName, icon, title, description,
  buttonLabel, loadingLabel, loading, success, onSuccessClear, onGenerate,
  messages, error, result, onDownload,
}: AIReportCardShellProps) {
  return (
    <div className={`bg-surface border rounded-2xl p-5 sm:p-6 space-y-4 border-l-4 ${containerClassName}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            {icon}{title}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={loading}
          className={`w-[220px] justify-center py-2.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 ${buttonClassName}`}
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {loadingLabel}</> : buttonLabel}
        </button>
      </div>
      <AILoadingStatus
        isRunning={loading}
        success={success}
        onSuccessClear={onSuccessClear}
        messages={messages}
      />
      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
          {error}
        </div>
      )}
      {result && (
        <div className="space-y-4 mt-6">
          {result}
          <div className="flex justify-end">
            <button
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-border hover:border-slate-600 text-xs font-medium"
              data-pdf-hide
            >
              <Download className={`w-3.5 h-3.5 ${accentClassName}`} /> Экспорт в MD
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
