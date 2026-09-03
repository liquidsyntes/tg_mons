import React from 'react';
import { LineChart, Line, YAxis } from 'recharts';

interface TrendCellProps {
  sparkline: number[] | undefined | null;
  deltaAbs: number | null;
}

export function TrendCell({ sparkline, deltaAbs }: TrendCellProps) {
  if (!sparkline || sparkline.length <= 1) {
    return <span className="text-slate-600 text-[10px]">н/д</span>;
  }

  const color =
    deltaAbs && deltaAbs > 0 ? '#34d399' :
    deltaAbs && deltaAbs < 0 ? '#fb7185' : '#94a3b8';

  return (
    <div className="w-full h-full min-w-[60px] max-w-[80px] min-h-[20px] max-h-[30px] mx-auto opacity-80 hover:opacity-100 transition-opacity">
      <LineChart width={80} height={30} data={sparkline.map(v => ({ value: v }))}>
        <YAxis domain={['dataMin', 'dataMax']} hide />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
