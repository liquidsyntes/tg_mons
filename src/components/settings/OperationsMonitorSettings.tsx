'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, RotateCcw } from 'lucide-react';
import { formatDurationMs } from '@/lib/ops';
import type { OpsStatusResponse, OpsSyncStatus } from '@/lib/types';

const statusLabels: Record<OpsSyncStatus, string> = {
  RUNNING: 'Выполняется',
  COMPLETED: 'Успешно',
  PARTIAL: 'Частично',
  FAILED: 'Ошибка',
};

const statusColors: Record<OpsSyncStatus, string> = {
  RUNNING: 'text-sky-300',
  COMPLETED: 'text-emerald-400',
  PARTIAL: 'text-amber-300',
  FAILED: 'text-rose-400',
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('ru-RU') : 'Нет данных';
}

export function OperationsMonitorSettings() {
  const [data, setData] = useState<OpsStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const response = await fetch('/api/ops/status');
    if (!response.ok) throw new Error('Не удалось загрузить состояние сбора');
    setData(await response.json() as OpsStatusResponse);
  }, []);

  useEffect(() => {
    loadStatus()
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [loadStatus]);

  async function resetChannel(channelId: number, isActive: boolean) {
    if (!isActive && !window.confirm('Сбросить ошибки и включить сбор этого канала?')) return;
    setBusyId(channelId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/ops/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-channel-errors', channelId }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error : 'Не удалось восстановить канал';
        throw new Error(message);
      }
      await loadStatus();
      setSuccess('Ошибки сброшены. Канал вернётся в следующий цикл сбора.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка восстановления');
    } finally {
      setBusyId(null);
    }
  }

  const latest = data?.latestJob;
  return (
    <section className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-border/50 bg-slate-900/40 flex items-center gap-3">
        <Activity className="w-5 h-5 text-accent" />
        <div>
          <h2 className="text-lg font-semibold text-white">Состояние сбора</h2>
          <p className="text-xs text-slate-400 mt-1">Запуски воркера и каналы с ошибками</p>
        </div>
      </div>
      <div className="p-6 space-y-6">
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        {success && <p role="status" className="text-sm text-emerald-400">{success}</p>}
        {loading ? <p className="text-sm text-slate-400">Загрузка состояния сбора...</p> : data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-slate-900/40 p-4">
                <p className="text-xs text-slate-400">Последний запуск</p>
                <p className={`mt-1 font-semibold ${latest ? statusColors[latest.status] : 'text-slate-300'}`}>
                  {latest ? statusLabels[latest.status] : 'Запусков ещё нет'}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-slate-900/40 p-4">
                <p className="text-xs text-slate-400">Длительность</p>
                <p className="mt-1 font-semibold text-white">
                  {latest?.status === 'RUNNING' ? 'Выполняется' : formatDurationMs(latest?.durationMs ?? null)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-slate-900/40 p-4">
                <p className="text-xs text-slate-400">Обработано каналов</p>
                <p className="mt-1 font-semibold text-white">
                  {latest ? `${latest.channelsSucceeded + latest.channelsFailed} / ${latest.channelsTotal}` : 'Нет данных'}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-slate-900/40 p-4">
                <p className="text-xs text-slate-400">Добавлено постов</p>
                <p className="mt-1 font-semibold text-white">{latest?.postsAdded ?? 'Нет данных'}</p>
              </div>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <p className="text-slate-300">Последний успешный цикл: <strong className="text-white">{formatDate(data.summary.lastSuccessfulAt)}</strong></p>
              <p className="text-slate-300">Успешных за 7 дней: <strong className="text-white">
                {data.summary.successRate7dPercent === null ? 'Нет данных' : `${data.summary.successRate7dPercent}%`}
              </strong></p>
              <p className="text-slate-300">Активных каналов: <strong className="text-white">{data.summary.activeChannels}</strong></p>
              <p className="text-slate-300">Отключены с ошибками: <strong className="text-white">{data.summary.disabledWithErrors}</strong></p>
            </div>

            <div className="border-t border-border pt-5 space-y-3">
              <h3 className="font-semibold text-white">Каналы с ошибками сбора</h3>
              {data.problemChannels.length === 0 ? <p className="text-sm text-slate-400">Каналов с ошибками нет.</p> :
                data.problemChannels.map(channel => (
                  <div key={channel.id} className="rounded-xl border border-border bg-slate-900/40 p-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1 text-sm">
                      <p className="font-medium text-white">{channel.title}{channel.username ? ` (@${channel.username})` : ''}</p>
                      <p className={channel.isActive ? 'text-amber-300' : 'text-rose-400'}>
                        {channel.isActive ? 'Активен, есть ошибки' : 'Сбор отключён, есть ошибки'} · Ошибок подряд: {channel.consecutiveErrors}
                      </p>
                      <p className="text-slate-400">Последний успешный сбор: {formatDate(channel.lastCollectedAt)}</p>
                      {channel.lastError && <p className="text-slate-300 break-words">Причина: {channel.lastError}</p>}
                    </div>
                    <button type="button" disabled={busyId === channel.id}
                      onClick={() => void resetChannel(channel.id, channel.isActive)}
                      className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                      <RotateCcw className="w-4 h-4" />
                      {busyId === channel.id ? 'Восстановление...' : 'Сбросить ошибки и включить'}
                    </button>
                  </div>
                ))}
            </div>

            <div className="border-t border-border pt-5 space-y-3">
              <h3 className="font-semibold text-white">Последние запуски</h3>
              {data.jobs.length === 0 ? <p className="text-sm text-slate-400">Запусков пока нет.</p> :
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-400"><tr>
                      <th className="py-2 pr-4">Начало</th><th className="py-2 pr-4">Статус</th>
                      <th className="py-2 pr-4">Каналы</th><th className="py-2 pr-4">Длительность</th>
                    </tr></thead>
                    <tbody>{data.jobs.map(job => (
                      <tr key={job.id} className="border-t border-border align-top">
                        <td className="py-3 pr-4 whitespace-nowrap">{formatDate(job.startedAt)}</td>
                        <td className={`py-3 pr-4 font-medium ${statusColors[job.status]}`}>{statusLabels[job.status]}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">{job.channelsSucceeded + job.channelsFailed} / {job.channelsTotal}</td>
                        <td className="py-3 pr-4">
                          {job.status === 'RUNNING' ? 'Выполняется' : formatDurationMs(job.durationMs)}
                          {job.errorSummary && <details className="mt-1 max-w-xs"><summary className="cursor-pointer text-slate-400">Причина ошибки</summary>
                            <p className="mt-1 text-slate-300 break-words">{job.errorSummary}</p></details>}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
