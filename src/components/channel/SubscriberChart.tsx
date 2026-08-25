'use client';

import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
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
  Legend
} from 'recharts';
import { ChannelMetrics } from '@/lib/types';
import { CustomSubscriberTooltip } from '@/components/CustomSubscriberTooltip';
import { formatNumber } from '@/lib/utils';

interface SubscriberChartProps {
  data: ChannelDetailStatsLike;
  channel: ChannelMetrics;
  myChannel: ChannelMetrics | null;
  isMine: boolean;
  period: '24h' | '7d' | '30d';
}

// Minimal type for the data we need
interface ChannelDetailStatsLike {
  membersHistory: {
    collectedAt: string;
    membersCount: number;
    myMembersCount?: number | null;
  }[];
}

export function SubscriberChart({ data, channel, myChannel, isMine, period }: SubscriberChartProps) {
  const [showMyChannelOverlay, setShowMyChannelOverlay] = useState(true);
  const [chartMode, setChartMode] = useState<'absolute' | 'growth'>('absolute');
  const [showForecast, setShowForecast] = useState(false);

  let forecastInfo: { targetMembers: number; daysToTarget: number } | null = null;
  const baseSubscriberData = (data?.membersHistory || []).map((item, index, arr) => {
    const d = new Date(item.collectedAt);
    const dateFormatted =
      period === '24h'
        ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

    let growth = 0;
    let myGrowth: number | undefined = undefined;

    if (index > 0) {
      growth = item.membersCount - arr[index - 1].membersCount;
      if (item.myMembersCount !== undefined && item.myMembersCount !== null &&
          arr[index - 1].myMembersCount !== undefined && arr[index - 1].myMembersCount !== null) {
        myGrowth = item.myMembersCount - arr[index - 1].myMembersCount!;
      }
    }

    return {
      time: dateFormatted,
      fullTime: d.toLocaleString('ru-RU'),
      members: item.membersCount,
      myMembers: item.myMembersCount ?? undefined,
      growth,
      myGrowth,
      forecast: undefined as number | undefined,
      isForecast: false,
    };
  });

  const subscriberChartData = [...baseSubscriberData];

  // Calculate linear regression forecast
  if (showForecast && chartMode === 'absolute' && baseSubscriberData.length > 1 && channel?.currentMembers) {
    const history = data!.membersHistory;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = history.length;
    const startT = new Date(history[0].collectedAt).getTime();

    history.forEach(item => {
      const x = (new Date(item.collectedAt).getTime() - startT) / (1000 * 60 * 60 * 24);
      const y = item.membersCount;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    const denominator = (n * sumX2 - sumX * sumX);

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
        const lastX = (new Date(history[n-1].collectedAt).getTime() - startT) / (1000 * 60 * 60 * 24);
        const daysToTarget = Math.max(0, targetX - lastX);

        if (daysToTarget > 0 && daysToTarget < 365) {
          forecastInfo = { targetMembers, daysToTarget: Math.ceil(daysToTarget) };

          let projectionDays = period === '24h' ? 0.5 : period === '30d' ? 10 : 3;
          projectionDays = Math.min(projectionDays, daysToTarget);

          const projectionX = lastX + projectionDays;
          const projectionY = Math.round(intercept + slope * projectionX);
          const targetDate = new Date(startT + projectionX * 24 * 60 * 60 * 1000);

          subscriberChartData[subscriberChartData.length - 1].forecast = history[n-1].membersCount;

          const dateFormatted = period === '24h'
            ? targetDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
            : targetDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

          subscriberChartData.push({
            time: dateFormatted,
            fullTime: targetDate.toLocaleString('ru-RU') + ' (прогноз)',
            members: undefined as any,
            myMembers: undefined,
            growth: 0,
            myGrowth: undefined,
            forecast: projectionY,
            isForecast: true
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
            История изменения числа подписчиков по снапшотам
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-border">
            <button
              onClick={() => setChartMode('absolute')}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
                chartMode === 'absolute' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Абсолютные
            </button>
            <button
              onClick={() => setChartMode('growth')}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
                chartMode === 'growth' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Прирост
            </button>
          </div>

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
            При текущем темпе канал достигнет <strong>{formatNumber(forecastInfo.targetMembers)}</strong> подписчиков через <strong>~{forecastInfo.daysToTarget} {forecastInfo.daysToTarget % 10 === 1 && forecastInfo.daysToTarget % 100 !== 11 ? 'день' : [2, 3, 4].includes(forecastInfo.daysToTarget % 10) && ![12, 13, 14].includes(forecastInfo.daysToTarget % 100) ? 'дня' : 'дней'}</strong>
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
              <LineChart data={subscriberChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} domain={['auto', 'auto']} tickFormatter={(v) => formatNumber(v)} />
                <Tooltip
                  content={<CustomSubscriberTooltip chartMode={chartMode} channel={channel} myChannel={myChannel} isMine={isMine} showMyChannelOverlay={showMyChannelOverlay} period={period} />}
                  cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="members" name={channel.title} stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3, fill: '#38bdf8' }} activeDot={{ r: 5 }} />
                {showForecast && (
                  <Line type="monotone" dataKey="forecast" name="Прогноз" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 4, fill: '#10b981' }} connectNulls />
                )}
                {!isMine && showMyChannelOverlay && myChannel && (
                  <Line type="monotone" dataKey="myMembers" name={`Мой: ${myChannel.title}`} stroke="#a855f7" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2, fill: '#a855f7' }} />
                )}
              </LineChart>
            ) : (
              <BarChart data={subscriberChartData.slice(1)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} tickFormatter={(v) => (v > 0 ? `+${formatNumber(v)}` : formatNumber(v))} />
                <Tooltip
                  content={<CustomSubscriberTooltip chartMode={chartMode} channel={channel} myChannel={myChannel} isMine={isMine} showMyChannelOverlay={showMyChannelOverlay} period={period} />}
                  cursor={{ fill: '#334155', opacity: 0.4 }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="growth" name={channel.title} fill="#38bdf8" radius={[3, 3, 0, 0]} />
                {!isMine && showMyChannelOverlay && myChannel && (
                  <Bar dataKey="myGrowth" name={`Мой: ${myChannel.title}`} fill="#a855f7" radius={[3, 3, 0, 0]} />
                )}
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
