'use client';

import React from 'react';
import { Layers, FileText, Image, Video, Vote, Link2 } from 'lucide-react';
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
import type { ContentFormatLeaders, ContentType, ContentTypePerformanceItem } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

interface ContentTypePerformanceProps {
  data: ContentTypePerformanceItem[];
  leaders?: ContentFormatLeaders;
  period?: '24h' | '7d' | '30d';
}

const TYPE_ICONS: Record<ContentType, React.ComponentType<{ className?: string }>> = {
  text: FileText,
  photo: Image,
  video: Video,
  poll: Vote,
  link: Link2,
};

const TYPE_COLORS: Record<ContentType, string> = {
  text: '#60a5fa',   // blue-400
  photo: '#34d399',  // emerald-400
  video: '#f472b6',  // pink-400
  poll: '#a78bfa',   // purple-400
  link: '#f59e0b',   // amber-500
};

interface TooltipPayloadItem {
  value: number;
  payload: ContentTypePerformanceItem;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  const Icon = TYPE_ICONS[item.type] || FileText;

  return (
    <div className="bg-slate-900 border border-border rounded-xl p-3 shadow-xl text-xs space-y-1.5 z-50">
      <div className="flex items-center gap-1.5 font-semibold text-white">
        <Icon className="w-3.5 h-3.5 text-accent" />
        <span>{item.label}</span>
      </div>
      <div className="text-slate-300">
        Средний ERR: <strong className="text-white">{item.avgErr !== null ? `${item.avgErr}%` : 'н/д'}</strong>
      </div>
      <div className="text-slate-400">
        Публикаций: <strong className="text-slate-200">{item.postsCount}</strong>
      </div>
      {item.avgViews !== null && (
        <div className="text-slate-400">
          Ср. просмотры: <strong className="text-slate-200">{formatNumber(item.avgViews)}</strong>
        </div>
      )}
    </div>
  );
}

export function ContentTypePerformance({ data, leaders, period = '7d' }: ContentTypePerformanceProps) {
  const items = data || [];
  const totalPosts = items.reduce((sum, item) => sum + item.postsCount, 0);

  const periodLabel = period === '24h' ? '24 часа' : period === '30d' ? '30 дней' : '7 дней';

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent" />
            Аналитика по форматам контента
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Охват и вовлечённость публикаций за {periodLabel}
          </p>
        </div>
        {totalPosts > 0 && (
          <span className="text-xs text-slate-400 font-mono">
            Всего постов: <strong className="text-white">{totalPosts}</strong>
          </span>
        )}
      </div>

      {totalPosts === 0 ? (
        <div className="h-48 flex items-center justify-center text-xs text-slate-500 font-mono">
          Нет публикаций за выбранный период для сравнения типов контента
        </div>
      ) : (
        <>
          {(leaders?.byErr || leaders?.byViews) && (
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              {leaders.byErr && <span>Лидер по ERR: <strong className="text-white">{items.find(item => item.type === leaders.byErr)?.label}</strong></span>}
              {leaders.byViews && <span>Лидер по охвату: <strong className="text-white">{items.find(item => item.type === leaders.byViews)?.label}</strong></span>}
              <span className="text-slate-500">от 2 постов формата</span>
            </div>
          )}
          <div className="h-56 w-full pt-2" aria-label="Средний ERR по форматам">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
              <BarChart data={items} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
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
                    <Cell key={entry.type} fill={TYPE_COLORS[entry.type] || '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 pt-2 border-t border-border/70">
            {items.map((item) => {
              const Icon = TYPE_ICONS[item.type] || FileText;
              const color = TYPE_COLORS[item.type] || '#22c55e';

              return (
                <div
                  key={item.type}
                  className="bg-slate-900/60 border border-border/70 rounded-xl p-3 flex flex-col justify-between"
                >
                  <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                    <span style={{ color }}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span>{item.label}</span>
                  </div>

                  <div className="mt-2 text-[11px] text-slate-400 font-mono">
                    {item.postsCount} {item.postsCount === 1 ? 'пост' : 'постов'} · {item.sharePercent}% публикаций
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-slate-400">Ср. просмотры</span><strong className="text-right text-white">{item.avgViews === null ? 'н/д' : formatNumber(item.avgViews)}</strong>
                    <span className="text-slate-400">Медиана</span><strong className="text-right text-white">{item.medianViews === null ? 'н/д' : formatNumber(item.medianViews)}</strong>
                    <span className="text-slate-400">ERR</span><strong className="text-right text-white">{item.avgErr === null ? 'н/д' : `${item.avgErr}%`}</strong>
                    <span className="text-slate-400">ER</span><strong className="text-right text-white">{item.avgEr === null ? 'н/д' : `${item.avgEr}%`}</strong>
                    <span className="text-slate-400">Ср. пересылки</span><strong className="text-right text-white">{item.avgForwards}</strong>
                    <span className="text-slate-400">Ср. комментарии</span><strong className="text-right text-white">{item.avgComments}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
