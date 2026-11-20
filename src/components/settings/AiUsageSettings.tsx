'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Cpu, Save } from 'lucide-react';
import { HelpPopover } from '@/components/help/HelpPopover';

interface Limits {
  aiHourlyLimit: number;
  aiConcurrentLimit: number;
  aiProviderConcurrency: number;
  aiDailyBudget?: string | null;
  aiMonthlyBudget?: string | null;
  aiBudgetMode?: 'WARN' | 'BLOCK';
  aiBudgetWarning?: number;
  aiBudgetTelegram?: boolean;
}

interface BudgetPeriodView {
  period: string;
  start: string;
  end: string;
  budget: string | null;
  knownCostUsd: string;
  unknownCostCalls: number;
  reached: boolean;
}

interface BudgetNoticeView {
  id: string;
  period: string;
  periodStart: string;
  threshold: number;
  delivery: string;
}

interface OperationCallView {
  model: string;
  stage: string;
  status: string;
  cost: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

interface OperationView {
  id: string;
  actor: string;
  kind: string;
  status: string;
  createdAt: string;
  calls: OperationCallView[];
}

interface Usage {
  budget?: {
    periods: BudgetPeriodView[];
    notices: BudgetNoticeView[];
  };
  operations: OperationView[];
  total: number;
  settings: Limits;
  summary: {
    knownCostUsd: string | null;
    unknownCostCalls: number;
    calls: number;
  };
}

const statuses: Record<string, string> = {
  RUNNING: 'Выполняется',
  SUCCEEDED: 'Успешно',
  FAILED: 'Ошибка',
  UNKNOWN: 'Исход неизвестен',
};

const statusBadgeClasses: Record<string, string> = {
  RUNNING: 'border-sky-500/30 bg-sky-500/15 text-sky-300',
  SUCCEEDED: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  FAILED: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
  UNKNOWN: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
};

const deliveryLabels: Record<string, string> = {
  PENDING: 'ожидает доставки',
  SENT: 'доставлено',
  FAILED: 'отказ доставки',
  UNKNOWN: 'исход доставки неизвестен',
};

const deliveryClasses: Record<string, string> = {
  PENDING: 'text-amber-300',
  SENT: 'text-emerald-400',
  FAILED: 'text-rose-400',
  UNKNOWN: 'text-amber-300',
};

const periodLabels: Record<string, string> = {
  day: 'День UTC',
  month: 'Месяц UTC',
};

const inputClassName =
  'w-full bg-slate-900 border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/50';

function formatCost(value: string): string {
  if (!value.includes('.')) return value;
  const trimmed = value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
  return trimmed;
}

function formatUtcDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('ru-RU', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatLocalDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU');
}

export function AiUsageSettings() {
  const [data, setData] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [days, setDays] = useState(7);
  const [actor, setActor] = useState('');
  const [kind, setKind] = useState('');
  const [limits, setLimits] = useState<Limits>({
    aiHourlyLimit: 0,
    aiConcurrentLimit: 0,
    aiProviderConcurrency: 4,
  });
  const [reload, setReload] = useState(0);
  const limitsLoadedRef = useRef(false);
  const lastReloadRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const shouldSyncLimits = !limitsLoadedRef.current || reload !== lastReloadRef.current;
    setLoading(true);
    void fetch(
      `/api/admin/ai-usage?${new URLSearchParams({
        page: String(page),
        days: String(days),
        actor,
        kind,
      })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) {
          const body: unknown = await r.json().catch(() => null);
          const message =
            body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
              ? body.error
              : 'Не удалось загрузить журнал';
          throw new Error(message);
        }
        return r.json() as Promise<Usage>;
      })
      .then((d) => {
        setData(d);
        if (shouldSyncLimits) {
          setLimits(d.settings);
          limitsLoadedRef.current = true;
          lastReloadRef.current = reload;
        }
        setError('');
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Ошибка загрузки');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [page, days, actor, kind, reload]);

  async function save() {
    setSaving(true);
    setError('');
    setSuccess(null);
    try {
      const payload: Limits = {
        ...limits,
        aiDailyBudget: limits.aiDailyBudget?.trim() || null,
        aiMonthlyBudget: limits.aiMonthlyBudget?.trim() || null,
      };
      const r = await fetch('/api/admin/ai-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const body: unknown = await r.json().catch(() => null);
        const message =
          body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
            ? body.error
            : 'Не удалось сохранить лимиты';
        throw new Error(message);
      }
      setSuccess('Лимиты и настройки бюджета сохранены');
      setReload((v) => v + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;
  const rangeStart = data && data.total > 0 ? page * 25 + 1 : 0;
  const rangeEnd = data && data.total > 0 ? Math.min((page + 1) * 25, data.total) : 0;

  return (
    <section className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-border/50 bg-slate-900/40 flex items-center gap-3">
        <Cpu className="w-5 h-5 text-accent shrink-0" />
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">Использование AI</h2>
            <HelpPopover sectionId="ai-usage-budget" />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Лимиты запросов, общие UTC-бюджеты, уведомления о порогах и журнал операций
          </p>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-400"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Сводка расходов и бюджеты UTC */}
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-slate-900/40 p-4">
              <p className="text-xs text-slate-400">Подтверждённые расходы</p>
              <p className="mt-1 font-semibold font-mono text-white tabular-nums">
                {data
                  ? data.summary.knownCostUsd !== null
                    ? `${formatCost(data.summary.knownCostUsd)} USD`
                    : 'нет данных'
                  : '...'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Запросов за {days} дн.: <span className="font-mono text-slate-300">{data?.summary.calls ?? 0}</span>
              </p>
            </div>

            <div className="rounded-xl border border-border bg-slate-900/40 p-4">
              <p className="text-xs text-slate-400">Без стоимости</p>
              <p className="mt-1 font-semibold font-mono text-white tabular-nums">
                {data ? `${data.summary.unknownCostCalls} запросов` : '...'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Вызовы без тарифа провайдера
              </p>
            </div>

            {data?.budget?.periods.map((p) => (
              <div key={p.period} className="rounded-xl border border-border bg-slate-900/40 p-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">{periodLabels[p.period] ?? p.period}</p>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      p.reached
                        ? 'bg-rose-500/15 text-rose-400'
                        : p.budget !== null
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {p.reached ? 'Бюджет достигнут' : p.budget !== null ? 'В пределах' : 'Отключён'}
                  </span>
                </div>
                <p className="font-semibold font-mono text-white tabular-nums">
                  {formatCost(p.knownCostUsd)} / {p.budget !== null ? `${formatCost(p.budget)} USD` : 'отключено'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {formatUtcDate(p.start)} – {formatUtcDate(p.end)} · без цены: {p.unknownCostCalls}
                </p>
              </div>
            ))}
          </div>

          {data?.budget?.notices && data.budget.notices.length > 0 && (
            <div className="space-y-2 pt-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Уведомления о порогах бюджета
              </h3>
              <div className="space-y-2">
                {data.budget.notices.map((n) => (
                  <div
                    role="status"
                    key={n.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-xs"
                  >
                    <span className="text-slate-200">
                      Порог <strong className="font-mono text-amber-300">{n.threshold}%</strong> (
                      {n.period === 'day' ? 'день' : n.period === 'month' ? 'месяц' : n.period},{' '}
                      <span className="font-mono">{formatUtcDate(n.periodStart)}</span>, UTC)
                    </span>
                    <span className={`font-medium ${deliveryClasses[n.delivery] ?? 'text-slate-300'}`}>
                      Telegram: {deliveryLabels[n.delivery] ?? n.delivery}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Лимиты и общий бюджет приложения */}
        <div className="border-t border-border pt-5 space-y-4">
          <div>
            <h3 className="font-semibold text-white">Лимиты и общий бюджет приложения</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Общий бюджет приложения: календарные день и месяц UTC. Пустая сумма отключает бюджет.
              Текущие вызовы продолжаются; неизвестная стоимость и выполняющиеся запросы могут
              привести к перерасходу. Оценочный CLI и внешние вызовы не входят.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1.5 text-xs font-medium text-slate-300">
              <span>Операций за час на инициатора (0: без лимита)</span>
              <input
                type="number"
                min={0}
                max={10000}
                value={limits.aiHourlyLimit}
                disabled={saving}
                onChange={(e) =>
                  setLimits({ ...limits, aiHourlyLimit: Number(e.target.value) })
                }
                className={`${inputClassName} font-mono`}
              />
            </label>

            <label className="space-y-1.5 text-xs font-medium text-slate-300">
              <span>Параллельных операций на инициатора (0: без лимита)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={limits.aiConcurrentLimit}
                disabled={saving}
                onChange={(e) =>
                  setLimits({ ...limits, aiConcurrentLimit: Number(e.target.value) })
                }
                className={`${inputClassName} font-mono`}
              />
            </label>

            <label className="space-y-1.5 text-xs font-medium text-slate-300">
              <span>Параллельных запросов провайдеру</span>
              <input
                type="number"
                min={1}
                max={32}
                value={limits.aiProviderConcurrency}
                disabled={saving}
                onChange={(e) =>
                  setLimits({ ...limits, aiProviderConcurrency: Number(e.target.value) })
                }
                className={`${inputClassName} font-mono`}
              />
            </label>

            <label className="space-y-1.5 text-xs font-medium text-slate-300">
              <span>Дневной бюджет USD</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Отключено"
                value={limits.aiDailyBudget ?? ''}
                disabled={saving}
                onChange={(e) =>
                  setLimits({ ...limits, aiDailyBudget: e.target.value || null })
                }
                className={`${inputClassName} font-mono`}
              />
            </label>

            <label className="space-y-1.5 text-xs font-medium text-slate-300">
              <span>Месячный бюджет USD</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Отключено"
                value={limits.aiMonthlyBudget ?? ''}
                disabled={saving}
                onChange={(e) =>
                  setLimits({ ...limits, aiMonthlyBudget: e.target.value || null })
                }
                className={`${inputClassName} font-mono`}
              />
            </label>

            <label className="space-y-1.5 text-xs font-medium text-slate-300">
              <span>Режим</span>
              <select
                value={limits.aiBudgetMode ?? 'WARN'}
                disabled={saving}
                onChange={(e) =>
                  setLimits({
                    ...limits,
                    aiBudgetMode: e.target.value === 'BLOCK' ? 'BLOCK' : 'WARN',
                  })
                }
                className={inputClassName}
              >
                <option value="WARN">Только предупреждать</option>
                <option value="BLOCK">Блокировать новые операции</option>
              </select>
            </label>

            <label className="space-y-1.5 text-xs font-medium text-slate-300">
              <span>Порог предупреждения (%)</span>
              <input
                type="number"
                min={1}
                max={99}
                value={limits.aiBudgetWarning ?? 80}
                disabled={saving}
                onChange={(e) =>
                  setLimits({ ...limits, aiBudgetWarning: Number(e.target.value) })
                }
                className={`${inputClassName} font-mono`}
              />
            </label>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <label className="inline-flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={limits.aiBudgetTelegram ?? false}
                disabled={saving}
                onChange={(e) =>
                  setLimits({ ...limits, aiBudgetTelegram: e.target.checked })
                }
                className="h-4 w-4 accent-indigo-400"
              />
              <span>Уведомлять в настроенный операционный Telegram-чат</span>
            </label>

            <button
              type="button"
              disabled={!data || saving}
              onClick={() => void save()}
              className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors shrink-0"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Сохранение...' : 'Сохранить лимиты'}
            </button>
          </div>
        </div>

        {/* Журнал операций AI */}
        <div className="border-t border-border pt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-white">Журнал операций</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                История AI-запросов, этапов выполнения, длительности и стоимости вызовов
              </p>
            </div>
            {data && (
              <span className="text-xs font-mono text-slate-400">
                Всего: <strong className="text-white">{data.total}</strong>
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-xs font-medium text-slate-300">
              <span>Период</span>
              <select
                value={days}
                onChange={(e) => {
                  setDays(Number(e.target.value));
                  setPage(0);
                }}
                className={inputClassName}
              >
                {[1, 7, 30, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} дней
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-xs font-medium text-slate-300">
              <span>Инициатор</span>
              <input
                type="text"
                value={actor}
                placeholder="user:1 / system:bearer"
                onChange={(e) => {
                  setActor(e.target.value);
                  setPage(0);
                }}
                className={`${inputClassName} font-mono`}
              />
            </label>

            <label className="space-y-1.5 text-xs font-medium text-slate-300">
              <span>Операция</span>
              <input
                type="text"
                value={kind}
                placeholder="summary / events-scan"
                onChange={(e) => {
                  setKind(e.target.value);
                  setPage(0);
                }}
                className={`${inputClassName} font-mono`}
              />
            </label>
          </div>

          {loading && !data ? (
            <p role="status" className="text-sm text-slate-400">
              Загрузка...
            </p>
          ) : !data ? null : data.operations.length === 0 ? (
            <div className="rounded-xl border border-border bg-slate-900/40 p-6 text-center text-sm text-slate-400">
              Операций за период нет
            </div>
          ) : (
            <div className="space-y-2">
              {data.operations.map((o) => (
                <details
                  key={o.id}
                  className="rounded-xl border border-border bg-slate-900/40 overflow-hidden"
                >
                  <summary className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-xs cursor-pointer hover:bg-slate-800/40 transition-colors">
                    <span className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-mono text-slate-400">
                        {formatLocalDateTime(o.createdAt)}
                      </span>
                      <span className="font-mono text-slate-200">{o.actor}</span>
                      <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-slate-200">
                        {o.kind}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-400 font-mono">
                        {o.calls.length} выз.
                      </span>
                      <span
                        className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                          statusBadgeClasses[o.status] ?? 'border-border bg-slate-800 text-slate-300'
                        }`}
                      >
                        {statuses[o.status] ?? o.status}
                      </span>
                    </span>
                  </summary>

                  <div className="border-t border-border/60 bg-slate-950/50 p-3 space-y-2 text-xs">
                    {o.calls.length === 0 ? (
                      <p className="text-slate-500">Вызовы провайдера не зафиксированы</p>
                    ) : (
                      o.calls.map((c, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-slate-900/50 px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="font-mono font-medium text-white">{c.model}</span>
                            <span className="text-slate-400">· {c.stage}</span>
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                                statusBadgeClasses[c.status] ?? 'border-border bg-slate-800 text-slate-300'
                              }`}
                            >
                              {statuses[c.status] ?? c.status}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 font-mono text-slate-300">
                            <span>
                              {c.cost !== null ? `${formatCost(c.cost)} USD` : 'стоимость неизвестна'}
                            </span>
                            <span>{c.durationMs ?? '?'} мс</span>
                            <span>
                              Токены: {c.inputTokens ?? '?'} / {c.outputTokens ?? '?'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <span className="text-xs text-slate-400 font-mono">
              {data && data.total > 0
                ? `Страница ${page + 1} из ${totalPages} · показано ${rangeStart}–${rangeEnd} из ${data.total}`
                : `Страница ${page + 1}`}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-border bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={!data || (page + 1) * 25 >= data.total || loading}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-border bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Далее
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
