'use client';

import React from 'react';
import {
  AlignLeft,
  FileText,
  HelpCircle,
  Hash,
  ListChecks,
  ImageOff,
  BookOpen,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import type {
  PostLengthAnalytics,
  PostLengthBucket,
  PostLengthPerformanceItem,
  PostStructureSignal,
} from '@/lib/types';
import { formatNumber } from '@/lib/utils';

interface PostLengthPerformanceProps {
  analytics?: PostLengthAnalytics;
  period?: '24h' | '7d' | '30d';
}

const BUCKET_ICONS: Record<
  PostLengthBucket,
  React.ComponentType<{ className?: string }>
> = {
  media_only: ImageOff,
  short: AlignLeft,
  medium: FileText,
  long: BookOpen,
};

const BUCKET_COLORS: Record<PostLengthBucket, string> = {
  media_only: '#94a3b8', // slate-400
  short: '#38bdf8',      // sky-400
  medium: '#34d399',     // emerald-400
  long: '#a78bfa',       // violet-400
};

const SIGNAL_ICONS: Record<
  PostStructureSignal,
  React.ComponentType<{ className?: string }>
> = {
  question_hook: HelpCircle,
  numbers_hook: Hash,
  structured_body: ListChecks,
};

interface TooltipPayloadItem {
  value: number;
  payload: PostLengthPerformanceItem;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  const Icon = BUCKET_ICONS[item.bucket] || FileText;

  return (
    <div className="bg-slate-900 border border-border rounded-xl p-3 shadow-xl text-xs space-y-1.5 z-50">
      <div className="flex items-center gap-1.5 font-semibold text-white">
        <Icon className="w-3.5 h-3.5 text-accent" />
        <span>{item.label}</span>
      </div>
      <div className="text-slate-300">
        Средний ERR:{' '}
        <strong className="text-white">
          {item.avgErr !== null ? `${item.avgErr}%` : 'н/д'}
        </strong>
      </div>
      <div className="text-slate-400">
        Публикаций: <strong className="text-slate-200">{item.postsCount}</strong>
      </div>
      {item.avgViews !== null && (
        <div className="text-slate-400">
          Ср. просмотры:{' '}
          <strong className="text-slate-200">{formatNumber(item.avgViews)}</strong>
        </div>
      )}
    </div>
  );
}

export function PostLengthPerformance({
  analytics,
  period = '7d',
}: PostLengthPerformanceProps) {
  const items = analytics?.items ?? [];
  const leaders = analytics?.leaders;
  const signals = analytics?.signals ?? [];
  const totalPosts =
    analytics?.totalPosts ??
    items.reduce((sum, item) => sum + item.postsCount, 0);
  const textPostsCount = analytics?.textPostsCount ?? 0;
  const avgTextLength = analytics?.avgTextLength ?? null;

  const periodLabel =
    period === '24h' ? '24 часа' : period === '30d' ? '30 дней' : '7 дней';

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <AlignLeft className="w-4 h-4 text-accent" />
            Аналитика длины и структуры постов
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Эффективность объёма текста и приёмов оформления за {periodLabel}
          </p>
        </div>
        {totalPosts > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
            {avgTextLength !== null && (
              <span>
                Ср. длина текста:{' '}
                <strong className="text-white">
                  {formatNumber(avgTextLength)} симв.
                </strong>
              </span>
            )}
            <span>
              С текстом:{' '}
              <strong className="text-white">
                {textPostsCount} из {totalPosts}
              </strong>
            </span>
          </div>
        )}
      </div>

      {totalPosts === 0 ? (
        <div className="h-40 flex items-center justify-center text-xs text-slate-500 font-mono">
          Нет публикаций за выбранный период для анализа длины и структуры постов
        </div>
      ) : (
        <>
          {(leaders?.byErr || leaders?.byViews) && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-300">
              {leaders.byErr && (
                <span>
                  Лидер по ERR:{' '}
                  <strong className="text-white">
                    {items.find((item) => item.bucket === leaders.byErr)?.label}
                  </strong>
                </span>
              )}
              {leaders.byViews && (
                <span>
                  Лидер по охвату:{' '}
                  <strong className="text-white">
                    {items.find((item) => item.bucket === leaders.byViews)?.label}
                  </strong>
                </span>
              )}
              <span className="text-slate-500">от 2 постов категории</span>
            </div>
          )}

          <div className="h-52 w-full pt-2" aria-label="Средний ERR по длине постов">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={160}
            >
              <BarChart
                data={items}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#1e293b' }}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#1e293b' }}
                  tickFormatter={(val: number) => `${val}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgErr" radius={[3, 3, 0, 0]} maxBarSize={48}>
                  {items.map((entry) => (
                    <Cell
                      key={entry.bucket}
                      fill={BUCKET_COLORS[entry.bucket] || '#38bdf8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 pt-2 border-t border-border/70">
            {items.map((item) => {
              const Icon = BUCKET_ICONS[item.bucket] || FileText;
              const color = BUCKET_COLORS[item.bucket] || '#38bdf8';

              return (
                <div
                  key={item.bucket}
                  className="bg-slate-900/60 border border-border/70 rounded-xl p-3 flex flex-col justify-between"
                >
                  <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                    <span style={{ color }}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span>{item.label}</span>
                  </div>

                  <div className="mt-2 text-[11px] text-slate-400 font-mono">
                    {item.postsCount} {item.postsCount === 1 ? 'пост' : 'постов'}{' '}
                    · {item.sharePercent}% публикаций
                    {item.bucket !== 'media_only' &&
                      ` · ср. ${formatNumber(item.avgLength)} симв.`}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-slate-400">Ср. просмотры</span>
                    <strong className="text-right text-white">
                      {item.avgViews === null
                        ? 'н/д'
                        : formatNumber(item.avgViews)}
                    </strong>
                    <span className="text-slate-400">Медиана</span>
                    <strong className="text-right text-white">
                      {item.medianViews === null
                        ? 'н/д'
                        : formatNumber(item.medianViews)}
                    </strong>
                    <span className="text-slate-400">ERR</span>
                    <strong className="text-right text-white">
                      {item.avgErr === null ? 'н/д' : `${item.avgErr}%`}
                    </strong>
                    <span className="text-slate-400">ER</span>
                    <strong className="text-right text-white">
                      {item.avgEr === null ? 'н/д' : `${item.avgEr}%`}
                    </strong>
                    <span className="text-slate-400">Ср. пересылки</span>
                    <strong className="text-right text-white">
                      {item.avgForwards}
                    </strong>
                    <span className="text-slate-400">Ср. комментарии</span>
                    <strong className="text-right text-white">
                      {item.avgComments}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>

          {signals.length > 0 && (
            <div className="pt-3 border-t border-border/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Приёмы структуры и зачина (хуки)
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  доля от текстовых постов
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {signals.map((sig) => {
                  const Icon = SIGNAL_ICONS[sig.signal] || HelpCircle;
                  return (
                    <div
                      key={sig.signal}
                      className="bg-slate-900/40 border border-border/60 rounded-xl p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                          <Icon className="w-3.5 h-3.5 text-accent" />
                          <span>{sig.label}</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          {sig.postsCount} ({sig.sharePercent}%)
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs pt-1">
                        <span className="text-slate-400">Ср. просмотры</span>
                        <strong className="text-right text-white">
                          {sig.avgViews === null
                            ? 'н/д'
                            : formatNumber(sig.avgViews)}
                        </strong>
                        <span className="text-slate-400">ERR</span>
                        <strong className="text-right text-white">
                          {sig.avgErr === null ? 'н/д' : `${sig.avgErr}%`}
                        </strong>
                        <span className="text-slate-400">ER</span>
                        <strong className="text-right text-white">
                          {sig.avgEr === null ? 'н/д' : `${sig.avgEr}%`}
                        </strong>
                        <span className="text-slate-400">Ср. пересылки</span>
                        <strong className="text-right text-white">
                          {sig.avgForwards}
                        </strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
