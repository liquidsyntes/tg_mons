'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { TrendingUp, Flame, Megaphone, ShieldAlert } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from 'recharts';
import type {
  ChannelMetrics,
  SubscriberTimelineEvent,
  SubscriberTimelineEventType,
} from '@/lib/types';
import {
  attachEventsToSnapshots,
  getDominantEventType,
} from '@/lib/metrics/subscriber-events';
import { CustomSubscriberTooltip } from '@/components/CustomSubscriberTooltip';
import { formatNumber } from '@/lib/utils';

interface SubscriberChartProps {
  data: ChannelDetailStatsLike;
  channel: ChannelMetrics;
  myChannel: ChannelMetrics | null;
  isMine: boolean;
  period: '24h' | '7d' | '30d';
}

interface ChannelDetailStatsLike {
  membersHistory: {
    collectedAt: string;
    membersCount: number;
    myMembersCount?: number | null;
  }[];
  timelineEvents?: SubscriberTimelineEvent[];
}

const EVENT_HEX_COLORS: Record<SubscriberTimelineEventType, string> = {
  viral_post: '#f59e0b',    // amber-500
  donor_mention: '#10b981', // emerald-500
  fraud_signal: '#f43f5e',  // rose-500
};

const EVENT_TYPE_LABELS: Record<SubscriberTimelineEventType, string> = {
  viral_post: 'Вирусные посты',
  donor_mention: 'Упоминания у доноров',
  fraud_signal: 'Сигналы антифрода',
};

const EVENT_BADGE_STYLES: Record<SubscriberTimelineEventType, string> = {
  viral_post: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  donor_mention: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  fraud_signal: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

const EVENT_ICONS: Record<
  SubscriberTimelineEventType,
  React.ComponentType<{ className?: string }>
> = {
  viral_post: Flame,
  donor_mention: Megaphone,
  fraud_signal: ShieldAlert,
};

interface SubscriberDotProps {
  cx?: number;
  cy?: number;
  payload?: {
    dominantEventType?: SubscriberTimelineEventType | null;
  };
  showEventsOverlay: boolean;
}

function renderSubscriberDot({
  cx,
  cy,
  payload,
  showEventsOverlay,
}: SubscriberDotProps): React.ReactElement<SVGElement> {
  if (typeof cx !== 'number' || typeof cy !== 'number') {
    return <g />;
  }
  const dominantType = showEventsOverlay ? payload?.dominantEventType : null;
  if (dominantType) {
    const color = EVENT_HEX_COLORS[dominantType];
    return (
      <circle
        cx={cx}
        cy={cy}
        r={5.5}
        fill={color}
        stroke="#0f172a"
        strokeWidth={2}
      />
    );
  }
  return <circle cx={cx} cy={cy} r={3} fill="#38bdf8" />;
}

export function SubscriberChart({
  data,
  channel,
  myChannel,
  isMine,
  period,
}: SubscriberChartProps) {
  const [showMyChannelOverlay, setShowMyChannelOverlay] = useState(false);
  const [chartMode, setChartMode] = useState<'absolute' | 'growth'>('absolute');
  const [showForecast, setShowForecast] = useState(false);
  const [showEventsOverlay, setShowEventsOverlay] = useState(true);
  const [eventFilter, setEventFilter] = useState<
    'all' | SubscriberTimelineEventType
  >('all');

  const allTimelineEvents = data?.timelineEvents ?? [];
  const filteredTimelineEvents =
    eventFilter === 'all'
      ? allTimelineEvents
      : allTimelineEvents.filter((ev) => ev.type === eventFilter);

  const { bySnapshotIndex, enrichedEvents } = attachEventsToSnapshots(
    data?.membersHistory ?? [],
    filteredTimelineEvents
  );

  const countsByType: Record<SubscriberTimelineEventType, number> = {
    viral_post: allTimelineEvents.filter((e) => e.type === 'viral_post').length,
    donor_mention: allTimelineEvents.filter((e) => e.type === 'donor_mention')
      .length,
    fraud_signal: allTimelineEvents.filter((e) => e.type === 'fraud_signal')
      .length,
  };

  let forecastInfo: { targetMembers: number; daysToTarget: number } | null =
    null;
  const baseSubscriberData = (data?.membersHistory || []).map(
    (item, index, arr) => {
      const d = new Date(item.collectedAt);
      const dateFormatted =
        period === '24h'
          ? d.toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

      let growth = 0;
      let myGrowth: number | undefined = undefined;

      if (index > 0) {
        growth = item.membersCount - arr[index - 1].membersCount;
        if (
          item.myMembersCount !== undefined &&
          item.myMembersCount !== null &&
          arr[index - 1].myMembersCount !== undefined &&
          arr[index - 1].myMembersCount !== null
        ) {
          myGrowth = item.myMembersCount - arr[index - 1].myMembersCount!;
        }
      }

      const pointEvents = showEventsOverlay
        ? bySnapshotIndex.get(index) ?? []
        : [];

      return {
        time: dateFormatted,
        fullTime: d.toLocaleString('ru-RU'),
        members: item.membersCount as number | undefined,
        myMembers: item.myMembersCount ?? undefined,
        growth,
        myGrowth,
        forecast: undefined as number | undefined,
        isForecast: false,
        events: pointEvents,
        dominantEventType: getDominantEventType(pointEvents),
      };
    }
  );

  const subscriberChartData = [...baseSubscriberData];

  // Calculate linear regression forecast
  if (
    showForecast &&
    chartMode === 'absolute' &&
    baseSubscriberData.length > 1 &&
    channel?.currentMembers
  ) {
    const history = data!.membersHistory;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;
    const n = history.length;
    const startT = new Date(history[0].collectedAt).getTime();

    history.forEach((item) => {
      const x =
        (new Date(item.collectedAt).getTime() - startT) / (1000 * 60 * 60 * 24);
      const y = item.membersCount;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    const denominator = n * sumX2 - sumX * sumX;

    if (denominator !== 0) {
      const slope = (n * sumXY - sumX * sumY) / denominator;
      const intercept = (sumY - slope * sumX) / n;

      if (slope > 0) {
        const currentMembers = channel.currentMembers;
        let magnitude = Math.pow(10, Math.floor(Math.log10(currentMembers)));
        if (magnitude < 1000) magnitude = 1000;
        let step = magnitude;
        if (magnitude >= 10000 && magnitude < 100000) step = 5000;
        else if (magnitude >= 100000) step = 10000;

        let targetMembers = Math.ceil(currentMembers / step) * step;
        if (targetMembers - currentMembers < step * 0.1) {
          targetMembers += step;
        }

        const targetX = (targetMembers - intercept) / slope;
        const lastX =
          (new Date(history[n - 1].collectedAt).getTime() - startT) /
          (1000 * 60 * 60 * 24);
        const daysToTarget = Math.max(0, targetX - lastX);

        if (daysToTarget > 0 && daysToTarget < 365) {
          forecastInfo = {
            targetMembers,
            daysToTarget: Math.ceil(daysToTarget),
          };

          let projectionDays =
            period === '24h' ? 0.5 : period === '30d' ? 10 : 3;
          projectionDays = Math.min(projectionDays, daysToTarget);

          const projectionX = lastX + projectionDays;
          const projectionY = Math.round(intercept + slope * projectionX);
          const targetDate = new Date(
            startT + projectionX * 24 * 60 * 60 * 1000
          );

          subscriberChartData[subscriberChartData.length - 1].forecast =
            history[n - 1].membersCount;

          const dateFormatted =
            period === '24h'
              ? targetDate.toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : targetDate.toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                });

          subscriberChartData.push({
            time: dateFormatted,
            fullTime: targetDate.toLocaleString('ru-RU') + ' (прогноз)',
            members: undefined,
            myMembers: undefined,
            growth: 0,
            myGrowth: undefined,
            forecast: projectionY,
            isForecast: true,
            events: [],
            dominantEventType: null,
          });
        }
      }
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            Динамика участников
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            История изменения числа подписчиков по снапшотам и ключевым событиям
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-border">
            <button
              onClick={() => setChartMode('absolute')}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
                chartMode === 'absolute'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Абсолютные
            </button>
            <button
              onClick={() => setChartMode('growth')}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
                chartMode === 'growth'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Прирост
            </button>
          </div>

          {allTimelineEvents.length > 0 && (
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer bg-slate-900/80 px-3 py-1.5 rounded-xl border border-border hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={showEventsOverlay}
                onChange={(e) => setShowEventsOverlay(e.target.checked)}
                className="rounded border-slate-700 text-amber-400 focus:ring-amber-400 bg-slate-800"
              />
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                События ({allTimelineEvents.length})
              </span>
            </label>
          )}

          {!isMine && myChannel && (
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer bg-slate-900/80 px-3 py-1.5 rounded-xl border border-border hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={showMyChannelOverlay}
                onChange={(e) => setShowMyChannelOverlay(e.target.checked)}
                className="rounded border-slate-700 text-accent focus:ring-accent bg-slate-800"
              />
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-violet-400"></span>
                Мой канал
              </span>
            </label>
          )}
          {chartMode === 'absolute' && (
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer bg-slate-900/80 px-3 py-1.5 rounded-xl border border-border hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={showForecast}
                onChange={(e) => setShowForecast(e.target.checked)}
                className="rounded border-slate-700 text-emerald-400 focus:ring-emerald-400 bg-slate-800"
              />
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-emerald-400"></span>
                Прогноз
              </span>
            </label>
          )}
        </div>
      </div>

      {showForecast && forecastInfo && chartMode === 'absolute' && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          <span>
            При текущем темпе канал достигнет{' '}
            <strong>{formatNumber(forecastInfo.targetMembers)}</strong>{' '}
            подписчиков через{' '}
            <strong>
              ~{forecastInfo.daysToTarget}{' '}
              {forecastInfo.daysToTarget % 10 === 1 &&
              forecastInfo.daysToTarget % 100 !== 11
                ? 'день'
                : [2, 3, 4].includes(forecastInfo.daysToTarget % 10) &&
                  ![12, 13, 14].includes(forecastInfo.daysToTarget % 100)
                ? 'дня'
                : 'дней'}
            </strong>
          </span>
        </div>
      )}

      <div className="h-72 w-full pt-4">
        {subscriberChartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
            Нет накопленных снапшотов за выбранный период
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === 'absolute' ? (
              <LineChart
                data={subscriberChartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
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
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => formatNumber(v)}
                />
                <Tooltip
                  content={
                    <CustomSubscriberTooltip
                      chartMode={chartMode}
                      channel={channel}
                      myChannel={myChannel}
                      isMine={isMine}
                      showMyChannelOverlay={showMyChannelOverlay}
                      showEventsOverlay={showEventsOverlay}
                      period={period}
                    />
                  }
                  cursor={{
                    stroke: '#334155',
                    strokeWidth: 1,
                    strokeDasharray: '4 4',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line
                  type="monotone"
                  dataKey="members"
                  name={channel.title}
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={(props) =>
                    renderSubscriberDot({
                      cx: props.cx,
                      cy: props.cy,
                      payload: props.payload,
                      showEventsOverlay,
                    })
                  }
                  activeDot={{ r: 5 }}
                />
                {showForecast && (
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name="Прогноз"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={{ r: 4, fill: '#10b981' }}
                    connectNulls
                  />
                )}
                {!isMine && showMyChannelOverlay && myChannel && (
                  <Line
                    type="monotone"
                    dataKey="myMembers"
                    name={`Мой: ${myChannel.title}`}
                    stroke="#a855f7"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 2, fill: '#a855f7' }}
                  />
                )}
              </LineChart>
            ) : (
              <BarChart
                data={subscriberChartData.slice(1)}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
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
                  tickFormatter={(v) =>
                    v > 0 ? `+${formatNumber(v)}` : formatNumber(v)
                  }
                />
                <Tooltip
                  content={
                    <CustomSubscriberTooltip
                      chartMode={chartMode}
                      channel={channel}
                      myChannel={myChannel}
                      isMine={isMine}
                      showMyChannelOverlay={showMyChannelOverlay}
                      showEventsOverlay={showEventsOverlay}
                      period={period}
                    />
                  }
                  cursor={{ fill: '#334155', opacity: 0.4 }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar
                  dataKey="growth"
                  name={channel.title}
                  fill="#38bdf8"
                  radius={[3, 3, 0, 0]}
                >
                  {subscriberChartData.slice(1).map((entry, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={
                        showEventsOverlay && entry.dominantEventType
                          ? EVENT_HEX_COLORS[entry.dominantEventType]
                          : '#38bdf8'
                      }
                    />
                  ))}
                </Bar>
                {!isMine && showMyChannelOverlay && myChannel && (
                  <Bar
                    dataKey="myGrowth"
                    name={`Мой: ${myChannel.title}`}
                    fill="#a855f7"
                    radius={[3, 3, 0, 0]}
                  />
                )}
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {showEventsOverlay && allTimelineEvents.length > 0 && (
        <div className="pt-3 border-t border-border/70 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300">
              События, повлиявшие на динамику ({filteredTimelineEvents.length})
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEventFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                  eventFilter === 'all'
                    ? 'bg-slate-800 text-white border-slate-600'
                    : 'bg-slate-900/60 text-slate-400 border-border hover:text-white'
                }`}
              >
                Все ({allTimelineEvents.length})
              </button>
              {(
                ['viral_post', 'donor_mention', 'fraud_signal'] as const
              ).map((type) => {
                const count = countsByType[type];
                if (count === 0) return null;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEventFilter(type)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1.5 ${
                      eventFilter === type
                        ? 'bg-slate-800 text-white border-slate-600'
                        : 'bg-slate-900/60 text-slate-400 border-border hover:text-white'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: EVENT_HEX_COLORS[type] }}
                    />
                    <span>
                      {EVENT_TYPE_LABELS[type]} ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
            {enrichedEvents.map((ev) => {
              const Icon = EVENT_ICONS[ev.type] || Flame;
              const dateLabel = new Date(ev.timestamp).toLocaleString('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={ev.id}
                  className="bg-slate-900/60 border border-border/70 rounded-xl p-2.5 flex flex-col justify-between gap-1.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${EVENT_BADGE_STYLES[ev.type]}`}
                    >
                      <Icon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{ev.title}</span>
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {dateLabel}
                    </span>
                  </div>

                  {ev.subtitle && (
                    <div className="text-[11px] text-slate-300 line-clamp-2">
                      {ev.sourceChannelId ? (
                        <Link
                          href={`/channel/${ev.sourceChannelId}`}
                          className="text-accent hover:underline"
                        >
                          {ev.subtitle}
                        </Link>
                      ) : (
                        ev.subtitle
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/70">
                    <span>
                      {ev.views !== null && ev.views !== undefined
                        ? `${formatNumber(ev.views)} просм.`
                        : 'Снимок аудитории'}
                    </span>
                    {ev.membersDeltaAtSnapshot !== null && (
                      <span
                        className={
                          ev.membersDeltaAtSnapshot > 0
                            ? 'text-emerald-400 font-semibold'
                            : ev.membersDeltaAtSnapshot < 0
                            ? 'text-rose-400 font-semibold'
                            : 'text-slate-400'
                        }
                      >
                        {ev.membersDeltaAtSnapshot > 0 ? '+' : ''}
                        {formatNumber(ev.membersDeltaAtSnapshot)} подп.
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
