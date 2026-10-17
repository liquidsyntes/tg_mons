'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';

interface AlertRuleView {
  id: number;
  channelId: number | null;
  metric: string;
  operator: 'gt' | 'lt';
  threshold: number;
  enabled: boolean;
  lastFiredAt: string | null;
}

interface AlertChannelOption {
  id: number;
  title: string;
  username: string | null;
  isActive: boolean;
}

interface AlertMetricOption {
  value: string;
  label: string;
  unit: string;
}

interface AlertListResponse {
  rules: AlertRuleView[];
  channels: AlertChannelOption[];
  metrics: AlertMetricOption[];
  deliveryConfigured: boolean;
}

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error : fallback;
    throw new Error(message);
  }
  return data as T;
}

export function AlertRulesSettings() {
  const [rules, setRules] = useState<AlertRuleView[]>([]);
  const [channels, setChannels] = useState<AlertChannelOption[]>([]);
  const [metrics, setMetrics] = useState<AlertMetricOption[]>([]);
  const [deliveryConfigured, setDeliveryConfigured] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [metric, setMetric] = useState('followers');
  const [operator, setOperator] = useState<'gt' | 'lt'>('gt');
  const [threshold, setThreshold] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/alerts')
      .then(response => readResponse<AlertListResponse>(response, 'Не удалось загрузить правила'))
      .then(data => {
        setRules(data.rules);
        setChannels(data.channels);
        setMetrics(data.metrics);
        setDeliveryConfigured(data.deliveryConfigured);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Не удалось загрузить правила'))
      .finally(() => setLoading(false));
  }, []);

  async function createRule(event: FormEvent) {
    event.preventDefault();
    if (threshold.trim() === '') return;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channelId ? Number(channelId) : null, metric, operator, threshold: Number(threshold) }),
      });
      const data = await readResponse<{ rule: AlertRuleView }>(response, 'Не удалось сохранить правило');
      setRules(current => [data.rule, ...current]);
      setThreshold('');
      setSuccess('Правило добавлено');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить правило');
    } finally {
      setCreating(false);
    }
  }

  async function toggleRule(rule: AlertRuleView) {
    setBusyId(rule.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      const data = await readResponse<{ rule: AlertRuleView }>(response, 'Не удалось обновить правило');
      setRules(current => current.map(item => item.id === rule.id ? data.rule : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось обновить правило');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRule(rule: AlertRuleView) {
    if (!window.confirm('Удалить правило уведомления?')) return;
    setBusyId(rule.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/alerts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id }),
      });
      await readResponse<{ success: boolean }>(response, 'Не удалось удалить правило');
      setRules(current => current.filter(item => item.id !== rule.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось удалить правило');
    } finally {
      setBusyId(null);
    }
  }

  const selectedMetric = metrics.find(item => item.value === metric);

  return (
    <section className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-border/50 bg-slate-900/40 flex items-center gap-3">
        <Bell className="w-5 h-5 text-accent" />
        <div>
          <h2 className="text-lg font-semibold text-white">Правила уведомлений</h2>
          <p className="text-xs text-slate-400 mt-1">Telegram-уведомление отправляется не чаще раза в 24 часа на правило.</p>
        </div>
      </div>
      <div className="p-6 space-y-5">
        {!deliveryConfigured && !loading && (
          <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            Telegram-уведомления пока не настроены на сервере. Правила можно сохранить, отправка начнётся после подключения бота и чата.
          </p>
        )}
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        {success && <p role="status" className="text-sm text-emerald-400">{success}</p>}

        <form onSubmit={createRule} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.7fr_0.7fr_auto] items-end">
          <label className="space-y-1.5 text-xs font-medium text-slate-300">
            <span>Канал</span>
            <select value={channelId} onChange={event => setChannelId(event.target.value)} disabled={loading || creating}
              className="w-full bg-slate-900 border border-border rounded-lg px-3 py-2.5 text-sm text-white">
              <option value="">Все каналы</option>
              {channels.map(channel => (
                <option key={channel.id} value={channel.id}>{channel.title}{channel.isActive ? '' : ' (отключён)'}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-300">
            <span>Метрика</span>
            <select value={metric} onChange={event => setMetric(event.target.value)} disabled={loading || creating}
              className="w-full bg-slate-900 border border-border rounded-lg px-3 py-2.5 text-sm text-white">
              {metrics.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-300">
            <span>Условие</span>
            <select value={operator} onChange={event => setOperator(event.target.value === 'lt' ? 'lt' : 'gt')} disabled={loading || creating}
              className="w-full bg-slate-900 border border-border rounded-lg px-3 py-2.5 text-sm text-white">
              <option value="gt">Больше</option>
              <option value="lt">Меньше</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-300">
            <span>Порог{selectedMetric ? ` (${selectedMetric.unit})` : ''}</span>
            <input type="number" step="any" required value={threshold} onChange={event => setThreshold(event.target.value)}
              disabled={loading || creating} placeholder="Значение"
              className="w-full bg-slate-900 border border-border rounded-lg px-3 py-2.5 text-sm text-white" />
          </label>
          <button type="submit" disabled={loading || creating || metrics.length === 0}
            className="flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-950">
            <Plus className="w-4 h-4" /> Добавить
          </button>
        </form>
        <p className="text-xs text-slate-500">Для «Все каналы» интервал общий: уведомление придёт по первому подходящему каналу за сутки.</p>

        <div className="border-t border-border pt-4 space-y-2">
          {loading ? <p className="text-sm text-slate-400">Загрузка правил...</p> : rules.length === 0 ? (
            <p className="text-sm text-slate-400">Правил пока нет.</p>
          ) : rules.map(rule => {
            const channel = channels.find(item => item.id === rule.channelId);
            const description = metrics.find(item => item.value === rule.metric);
            return (
              <div key={rule.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-slate-900/40 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    {channel?.title ?? 'Все каналы'}: {description?.label ?? rule.metric} {rule.operator === 'gt' ? '>' : '<'} {rule.threshold} {description?.unit ?? ''}
                  </p>
                  {rule.lastFiredAt && <p className="text-xs text-slate-400 mt-1">Последняя отправка: {new Date(rule.lastFiredAt).toLocaleString('ru-RU')}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" disabled={busyId === rule.id} onClick={() => toggleRule(rule)}
                    aria-label={rule.enabled ? 'Выключить правило' : 'Включить правило'}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${rule.enabled ? 'border-emerald-500/30 text-emerald-400' : 'border-border text-slate-400'}`}>
                    {rule.enabled ? 'Включено' : 'Выключено'}
                  </button>
                  <button type="button" disabled={busyId === rule.id} onClick={() => deleteRule(rule)}
                    aria-label="Удалить правило" className="rounded-lg border border-border p-1.5 text-slate-400 hover:text-rose-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
