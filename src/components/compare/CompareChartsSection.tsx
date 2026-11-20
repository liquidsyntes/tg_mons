'use client';

import React, { useMemo, useState } from 'react';
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
import type {
  CompareParticipantStats,
  MergedPostsPoint,
  MergedSubscriberPoint,
  MultiChannelComparisonResult,
} from '@/lib/compare';
import { formatNumber } from '@/lib/utils';
import { getParticipantStyle } from './compareTheme';
import { HelpPopover } from '@/components/help/HelpPopover';

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '3px',
  fontSize: '12px',
};

const TOOLTIP_LABEL_STYLE: React.CSSProperties = { color: '#94a3b8' };
const LEGEND_WRAPPER_STYLE: React.CSSProperties = { fontSize: '12px', paddingTop: '10px' };

export type SubscriberScaleMode = 'absolute' | 'relative';

export interface CompareChartsSectionProps {
  participants?: ReadonlyArray<CompareParticipantStats>;
  comparison?: MultiChannelComparisonResult | null;
  // Обратная совместимость со старым 2-канальным контрактом
  titleA?: string;
  titleB?: string;
  mergedSubscriberData?: ReadonlyArray<MergedSubscriberPoint>;
  mergedPostsData?: ReadonlyArray<MergedPostsPoint>;
}

export function CompareChartsSection({
  participants,
  comparison,
  titleA,
  titleB,
  mergedSubscriberData,
  mergedPostsData,
}: CompareChartsSectionProps) {
  const [scaleMode, setScaleMode] = useState<SubscriberScaleMode>('absolute');

  const multiMode = Boolean(participants && participants.length > 0 && comparison);

  const subscriberSeriesData = useMemo(() => {
    if (!multiMode || !comparison || !participants) return [];
    return comparison.subscriberSeries.map((point) => {
      const row: Record<string, string | number | null> = {
        time: point.time,
        fullTime: point.fullTime,
      };
      for (const participant of participants) {
        const id = participant.channel.id;
        row[`ch_${id}`] =
          scaleMode === 'relative'
            ? point.growthPctByChannel[id] ?? null
            : point.membersByChannel[id] ?? null;
      }
      return row;
    });
  }, [multiMode, comparison, participants, scaleMode]);

  const postsSeriesData = useMemo(() => {
    if (!multiMode || !comparison || !participants) return [];
    return comparison.postsSeries.map((point) => {
      const row: Record<string, string | number> = { date: point.date };
      for (const participant of participants) {
        const id = participant.channel.id;
        row[`posts_${id}`] = point.postsByChannel[id] ?? 0;
        row[`views_${id}`] = point.viewsByChannel[id] ?? 0;
      }
      return row;
    });
  }, [multiMode, comparison, participants]);

  const hasSubData = multiMode
    ? subscriberSeriesData.length > 0
    : (mergedSubscriberData?.length ?? 0) > 0;
  const hasPostsData = multiMode
    ? postsSeriesData.length > 0
    : (mergedPostsData?.length ?? 0) > 0;

  const isDualAxisAbsolute =
    scaleMode === 'absolute' &&
    ((multiMode && (participants?.length ?? 0) === 2) || !multiMode);

  return (
    <>
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              <span>Динамика подписчиков</span>
              <HelpPopover sectionId="compare-charts" />
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {scaleMode === 'relative'
                ? 'Относительный рост в % от первой точки выбранного периода'
                : 'Наложение кривых аудитории сравниваемых каналов'}
            </p>
          </div>

          {multiMode && (
            <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-border" role="group" aria-label="Режим графика подписчиков">
              <button
                type="button"
                aria-pressed={scaleMode === 'absolute'}
                onClick={() => setScaleMode('absolute')}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  scaleMode === 'absolute'
                    ? 'bg-accent text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Абсолютные значения
              </button>
              <button
                type="button"
                aria-pressed={scaleMode === 'relative'}
                onClick={() => setScaleMode('relative')}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  scaleMode === 'relative'
                    ? 'bg-accent text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Относительный рост (%)
              </button>
            </div>
          )}
        </div>

        <div className="h-72 w-full">
          {hasSubData ? (
            <ResponsiveContainer width="100%" height="100%">
              {multiMode && participants ? (
                <LineChart data={subscriberSeriesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                  {isDualAxisAbsolute ? (
                    <>
                      <YAxis
                        yAxisId="left"
                        stroke={getParticipantStyle(0, participants[0].channel.isBenchmark).stroke}
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(v) => formatNumber(v)}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke={getParticipantStyle(1, participants[1].channel.isBenchmark).stroke}
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(v) => formatNumber(v)}
                      />
                    </>
                  ) : (
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) =>
                        scaleMode === 'relative'
                          ? `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`
                          : formatNumber(v)
                      }
                    />
                  )}
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                  <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
                  {participants.map((participant, idx) => {
                    const style = getParticipantStyle(idx, participant.channel.isBenchmark);
                    return (
                      <Line
                        key={participant.channel.id}
                        yAxisId={isDualAxisAbsolute ? (idx === 0 ? 'left' : 'right') : undefined}
                        type="monotone"
                        dataKey={`ch_${participant.channel.id}`}
                        name={participant.channel.title}
                        stroke={style.stroke}
                        strokeWidth={participant.channel.isBenchmark ? 2 : 2.5}
                        strokeDasharray={participant.channel.isBenchmark ? '6 4' : undefined}
                        dot={false}
                        connectNulls
                      />
                    );
                  })}
                </LineChart>
              ) : (
                <LineChart data={[...(mergedSubscriberData ?? [])]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis yAxisId="left" stroke="#38bdf8" fontSize={11} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                  <YAxis yAxisId="right" orientation="right" stroke="#fbbf24" fontSize={11} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                  <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
                  <Line yAxisId="left" type="monotone" dataKey="membersA" name={titleA ?? 'Канал A'} stroke="#38bdf8" strokeWidth={2.5} dot={false} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="membersB" name={titleB ?? 'Канал B'} stroke="#fbbf24" strokeWidth={2.5} dot={false} connectNulls />
                </LineChart>
              )}
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
          {hasPostsData ? (
            <ResponsiveContainer width="100%" height="100%">
              {multiMode && participants ? (
                <BarChart data={postsSeriesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                  <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
                  {participants.map((participant, idx) => {
                    const style = getParticipantStyle(idx, participant.channel.isBenchmark);
                    return (
                      <Bar
                        key={participant.channel.id}
                        dataKey={`posts_${participant.channel.id}`}
                        name={participant.channel.title}
                        fill={style.stroke}
                        radius={[3, 3, 0, 0]}
                      />
                    );
                  })}
                </BarChart>
              ) : (
                <BarChart data={[...(mergedPostsData ?? [])]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                  <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
                  <Bar dataKey="postsA" name={titleA ?? 'Канал A'} fill="#38bdf8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="postsB" name={titleB ?? 'Канал B'} fill="#fbbf24" radius={[3, 3, 0, 0]} />
                </BarChart>
              )}
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
          {hasPostsData ? (
            <ResponsiveContainer width="100%" height="100%">
              {multiMode && participants ? (
                <LineChart data={postsSeriesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                  <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
                  {participants.map((participant, idx) => {
                    const style = getParticipantStyle(idx, participant.channel.isBenchmark);
                    return (
                      <Line
                        key={participant.channel.id}
                        type="monotone"
                        dataKey={`views_${participant.channel.id}`}
                        name={`${participant.channel.title} (просм.)`}
                        stroke={style.stroke}
                        strokeWidth={2}
                        strokeDasharray={participant.channel.isBenchmark ? '6 4' : undefined}
                        dot={{ r: 3 }}
                      />
                    );
                  })}
                </LineChart>
              ) : (
                <LineChart data={[...(mergedPostsData ?? [])]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                  <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
                  <Line type="monotone" dataKey="viewsA" name={`${titleA ?? 'Канал A'} (просм.)`} stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="viewsB" name={`${titleB ?? 'Канал B'} (просм.)`} stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              )}
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
