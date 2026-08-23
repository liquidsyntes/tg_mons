import React from 'react';
import { formatNumber } from '@/lib/utils';
import { ChannelMetrics } from '@/lib/types';

interface TooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  chartMode: 'absolute' | 'growth';
  channel: ChannelMetrics | null;
  myChannel: ChannelMetrics | null;
  isMine: boolean;
  showMyChannelOverlay: boolean;
  period: string;
}

export function CustomSubscriberTooltip({
  active,
  payload,
  label,
  chartMode,
  channel,
  myChannel,
  isMine,
  showMyChannelOverlay,
  period,
}: TooltipProps) {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload;
    const isGrowthMode = chartMode === 'growth';

    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-lg max-w-[280px]">
        <p className="text-slate-400 text-xs mb-2 pb-2 border-b border-slate-800">
          {dataPoint.fullTime || label}
        </p>

        <div className="space-y-2 text-sm">
          {/* Competitor / Current Channel */}
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-sky-400">{channel?.title}</span>
            <div className="flex items-baseline gap-2">
              <span className="text-white font-mono">
                {formatNumber(isGrowthMode ? dataPoint.growth : dataPoint.members)}
              </span>
              {!isGrowthMode && dataPoint.growth !== 0 && (
                <span className={`text-[11px] font-mono ${dataPoint.growth > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ({dataPoint.growth > 0 ? '+' : ''}
                  {formatNumber(dataPoint.growth)} {period === '24h' ? 'за час' : 'за период'})
                </span>
              )}
              {isGrowthMode && dataPoint.members !== undefined && (
                <span className="text-[11px] text-slate-400 font-mono">
                  (всего: {formatNumber(dataPoint.members)})
                </span>
              )}
            </div>
          </div>

          {/* My Channel */}
          {!isMine && showMyChannelOverlay && dataPoint.myMembers !== undefined && myChannel && (
            <div className="flex flex-col gap-0.5 pt-1.5 border-t border-slate-800">
              <span className="font-semibold text-violet-400">Мой: {myChannel.title}</span>
              <div className="flex items-baseline gap-2">
                <span className="text-white font-mono">
                  {formatNumber(isGrowthMode ? dataPoint.myGrowth || 0 : dataPoint.myMembers)}
                </span>
                {!isGrowthMode && dataPoint.myGrowth !== undefined && dataPoint.myGrowth !== 0 && (
                  <span className={`text-[11px] font-mono ${dataPoint.myGrowth > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ({dataPoint.myGrowth > 0 ? '+' : ''}
                    {formatNumber(dataPoint.myGrowth)})
                  </span>
                )}
                {isGrowthMode && (
                  <span className="text-[11px] text-slate-400 font-mono">
                    (всего: {formatNumber(dataPoint.myMembers)})
                  </span>
                )}
              </div>

              {/* Difference in Absolute mode */}
              {!isGrowthMode && dataPoint.members !== undefined && (
                <div className="text-[11px] text-slate-400 mt-1">
                  {dataPoint.myMembers > dataPoint.members ? (
                    <span>
                      Вы опережаете на <strong className="text-emerald-400">{formatNumber(dataPoint.myMembers - dataPoint.members)}</strong>
                    </span>
                  ) : dataPoint.myMembers < dataPoint.members ? (
                    <span>
                      Вы отстаете на <strong className="text-rose-400">{formatNumber(dataPoint.members - dataPoint.myMembers)}</strong>
                    </span>
                  ) : (
                    <span className="text-slate-300">Аудитории равны</span>
                  )}
                </div>
              )}

              {/* Difference in Growth mode */}
              {isGrowthMode && dataPoint.myGrowth !== undefined && dataPoint.growth !== undefined && (
                <div className="text-[11px] text-slate-400 mt-1">
                  {dataPoint.myGrowth > dataPoint.growth ? (
                    <span>
                      Растёте быстрее на <strong className="text-emerald-400">{formatNumber(dataPoint.myGrowth - dataPoint.growth)}</strong>
                    </span>
                  ) : dataPoint.myGrowth < dataPoint.growth ? (
                    <span>
                      Растёте медленнее на <strong className="text-rose-400">{formatNumber(dataPoint.growth - dataPoint.myGrowth)}</strong>
                    </span>
                  ) : (
                    <span className="text-slate-300">Темп роста одинаковый</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
}
