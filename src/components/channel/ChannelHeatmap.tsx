'use client';

import { useState } from 'react';
import { Flame } from 'lucide-react';

interface ChannelHeatmapProps {
  heatmapData: { day: number; hour: number; count: number }[];
  myHeatmapData?: { day: number; hour: number; count: number }[];
  isMine: boolean;
  hasMyChannel: boolean;
}

export function ChannelHeatmap({ heatmapData, myHeatmapData, isMine, hasMyChannel }: ChannelHeatmapProps) {
  const [showMyChannelOverlay, setShowMyChannelOverlay] = useState(true);
  const maxHeatmapCount = Math.max(...(heatmapData || []).map((d) => d.count), 1);

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500" />
            Тепловая карта публикаций
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            В какие дни недели и часы выходит больше всего постов (за выбранный период)
          </p>
        </div>

        {!isMine && hasMyChannel && (
          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer bg-slate-900/80 px-3 py-1.5 rounded-xl border border-border hover:border-slate-700 transition-colors">
            <input
              type="checkbox"
              checked={showMyChannelOverlay}
              onChange={(e) => setShowMyChannelOverlay(e.target.checked)}
              className="rounded border-slate-700 text-accent focus:ring-accent bg-slate-800"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm border-2 border-violet-500"></span>
              Наложить мои посты
            </span>
          </label>
        )}
      </div>

      <div className="pt-2 overflow-x-auto scrollbar-hide">
        <div className="min-w-[600px]">
          {/* Hours Header */}
          <div className="flex">
            <div className="w-8 shrink-0"></div>
            <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="text-[10px] text-slate-500 text-center">{i}</div>
              ))}
            </div>
          </div>

          {/* Grid Rows */}
          <div className="mt-1 flex flex-col gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map((dayIdx) => {
              const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
              return (
                <div key={dayIdx} className="flex items-center">
                  <div className="w-8 shrink-0 text-[10px] font-medium text-slate-400 flex items-center justify-end pr-2">
                    {dayNames[dayIdx]}
                  </div>
                  <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                    {Array.from({ length: 24 }).map((_, hour) => {
                      const cellData = heatmapData?.find((d) => d.day === dayIdx && d.hour === hour);
                      const count = cellData?.count || 0;

                      let myCount = 0;
                      if (!isMine && showMyChannelOverlay && myHeatmapData) {
                        myCount = myHeatmapData.find((d) => d.day === dayIdx && d.hour === hour)?.count || 0;
                      }

                      const intensity = count > 0 ? Math.max(0.2, count / maxHeatmapCount) : 0;

                      let tooltipText = `${dayNames[dayIdx]}, ${hour}:00 — Конкурент: ${count}`;
                      if (!isMine && showMyChannelOverlay) {
                        tooltipText += ` | Мой канал: ${myCount}`;
                        if (count === 0 && myCount > 0) tooltipText += ' (Свободное окно!)';
                        if (count > 0 && myCount > 0) tooltipText += ' (Пересечение)';
                      }

                      return (
                        <div
                          key={hour}
                          title={tooltipText}
                          className={`aspect-square rounded-sm transition-all duration-200 cursor-pointer ${
                            myCount > 0 ? 'ring-2 ring-violet-500 ring-inset z-10 scale-105' : 'hover:ring-1 hover:ring-white/50'
                          }`}
                          style={{
                            backgroundColor: count > 0 ? `rgba(249, 115, 22, ${intensity})` : 'rgba(30, 41, 59, 0.5)',
                          }}
                        ></div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
