import React from 'react';
import { BarChart2, Eye, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MergedPostsPoint, MergedSubscriberPoint } from '@/lib/compare';
import { formatNumber } from '@/lib/utils';

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '12px',
  fontSize: '12px',
};

const TOOLTIP_LABEL_STYLE: React.CSSProperties = { color: '#94a3b8' };
const LEGEND_WRAPPER_STYLE: React.CSSProperties = { fontSize: '12px', paddingTop: '10px' };

export interface CompareChartsSectionProps {
  titleA: string;
  titleB: string;
  mergedSubscriberData: ReadonlyArray<MergedSubscriberPoint>;
  mergedPostsData: ReadonlyArray<MergedPostsPoint>;
}

export function CompareChartsSection({
  titleA,
  titleB,
  mergedSubscriberData,
  mergedPostsData,
}: CompareChartsSectionProps) {
  return (
    <>
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            Динамика подписчиков
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Наложение кривых роста двух каналов</p>
        </div>

        <div className="h-72 w-full">
          {mergedSubscriberData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...mergedSubscriberData]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  stroke="#38bdf8"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => formatNumber(v)}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#fbbf24"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => formatNumber(v)}
                />
                <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="membersA"
                  name={titleA}
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="membersB"
                  name={titleB}
                  stroke="#fbbf24"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Нет данных для отображения
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-accent" />
            Активность публикаций
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Количество постов по дням</p>
        </div>

        <div className="h-64 w-full">
          {mergedPostsData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...mergedPostsData]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
                <Bar dataKey="postsA" name={titleA} fill="#38bdf8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="postsB" name={titleB} fill="#fbbf24" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Нет данных для отображения
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Eye className="w-4 h-4 text-accent" />
            Средние просмотры
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Средние просмотры на пост по дням</p>
        </div>

        <div className="h-64 w-full">
          {mergedPostsData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...mergedPostsData]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
                <Line
                  type="monotone"
                  dataKey="viewsA"
                  name={`${titleA} (просм.)`}
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="viewsB"
                  name={`${titleB} (просм.)`}
                  stroke="#fbbf24"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Нет данных для отображения
            </div>
          )}
        </div>
      </div>
    </>
  );
}
