import React from 'react';

interface HeatmapChartProps {
  data: { day: number; hour: number; count: number }[];
  myData?: { day: number; hour: number; count: number }[];
  showOverlay?: boolean;
}

export function HeatmapChart({ data, myData, showOverlay }: HeatmapChartProps) {
  const maxHeatmapCount = Math.max(...data.map(d => d.count), 1);
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const orderedDays = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="pt-2 overflow-x-auto scrollbar-hide">
      <div className="min-w-[600px]">
        {/* Hours Header */}
        <div className="flex">
          <div className="w-8 shrink-0"></div>
          <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="text-[10px] text-slate-500 text-center">
                {i}
              </div>
            ))}
          </div>
        </div>
        
        {/* Grid Rows */}
        <div className="mt-1 flex flex-col gap-1">
          {orderedDays.map((dayIdx) => {
            return (
              <div key={dayIdx} className="flex items-center">
                <div className="w-8 shrink-0 text-[10px] font-medium text-slate-400 flex items-center justify-end pr-2">
                  {dayNames[dayIdx]}
                </div>
                <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                  {Array.from({ length: 24 }).map((_, hour) => {
                    const cellData = data.find(d => d.day === dayIdx && d.hour === hour);
                    const count = cellData?.count || 0;
                    
                    let myCount = 0;
                    if (showOverlay && myData) {
                      myCount = myData.find(d => d.day === dayIdx && d.hour === hour)?.count || 0;
                    }
                    
                    const intensity = count > 0 ? Math.max(0.2, count / maxHeatmapCount) : 0;
                    
                    let tooltipText = `${dayNames[dayIdx]}, ${hour}:00 — Конкурент: ${count}`;
                    if (showOverlay) {
                      tooltipText += ` | Мой канал: ${myCount}`;
                      if (count === 0 && myCount > 0) tooltipText += ' (Свободное окно!)';
                      if (count > 0 && myCount > 0) tooltipText += ' (Пересечение)';
                    }
                    
                    return (
                      <div
                        key={hour}
                        title={tooltipText}
                        className={`aspect-square rounded-sm transition-all duration-200 cursor-pointer ${
                          myCount > 0 
                            ? 'ring-2 ring-violet-500 ring-inset z-10 scale-105' 
                            : 'hover:ring-1 hover:ring-white/50'
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
  );
}
