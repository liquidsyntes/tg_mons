import React from 'react';

interface HeatmapChartProps {
  data: { day: number; hour: number; count: number }[];
}

const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function HeatmapChart({ data }: HeatmapChartProps) {
  // Find max count for color scaling
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  // Group data by day
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  data.forEach(({ day, hour, count }) => {
    grid[day][hour] = count;
  });

  // Reorder days: Mon(1) to Sun(0)
  const orderedDays = [1, 2, 3, 4, 5, 6, 0];

  const getColor = (count: number) => {
    if (count === 0) return 'bg-slate-900 border-border/40';
    
    // Scale intensity from 10 to 100 based on count/maxCount
    const intensity = count / maxCount;
    
    if (intensity < 0.2) return 'bg-accent/20 border-accent/20 text-accent';
    if (intensity < 0.4) return 'bg-accent/40 border-accent/40 text-background';
    if (intensity < 0.6) return 'bg-accent/60 border-accent/60 text-background';
    if (intensity < 0.8) return 'bg-accent/80 border-accent/80 text-background';
    return 'bg-accent border-accent text-background font-bold';
  };

  return (
    <div className="overflow-x-auto pb-4">
      <div className="min-w-[600px] flex flex-col gap-1">
        {/* Hours Header */}
        <div className="flex ml-8 gap-1 mb-2">
          {HOURS.map((h) => (
            <div key={h} className="flex-1 text-center text-[10px] text-slate-500 font-mono">
              {h}
            </div>
          ))}
        </div>

        {/* Heatmap Grid */}
        {orderedDays.map((dayIdx) => (
          <div key={dayIdx} className="flex items-center gap-1">
            <div className="w-8 text-[11px] font-medium text-slate-400 text-right pr-2">
              {DAYS[dayIdx]}
            </div>
            {HOURS.map((hour) => {
              const count = grid[dayIdx][hour];
              return (
                <div
                  key={`${dayIdx}-${hour}`}
                  title={`${DAYS[dayIdx]} ${hour}:00 - Постов: ${count}`}
                  className={`flex-1 aspect-square rounded-sm border flex items-center justify-center text-[9px] transition-colors hover:ring-1 hover:ring-white/50 cursor-crosshair ${getColor(count)}`}
                >
                  {count > 0 ? count : ''}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex justify-end items-center gap-2 mt-4 text-[10px] text-slate-500">
        <span>Меньше</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-sm bg-slate-900 border border-border/40"></div>
          <div className="w-3 h-3 rounded-sm bg-accent/20"></div>
          <div className="w-3 h-3 rounded-sm bg-accent/40"></div>
          <div className="w-3 h-3 rounded-sm bg-accent/60"></div>
          <div className="w-3 h-3 rounded-sm bg-accent/80"></div>
          <div className="w-3 h-3 rounded-sm bg-accent"></div>
        </div>
        <span>Больше</span>
      </div>
    </div>
  );
}
