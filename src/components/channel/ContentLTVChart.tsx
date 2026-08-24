'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { TrendingUp, Clock } from 'lucide-react';

interface LTVData {
  hour: number;
  percent: number;
}

export default function ContentLTVChart({ channelId }: { channelId: number }) {
  const [data, setData] = useState<LTVData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/channels/${channelId}/ltv`)
      .then(r => r.json())
      .then(d => {
        setData(d.ltv || []);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, [channelId]);

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4 animate-pulse h-[300px]" />
    );
  }

  if (data.length === 0 || data[data.length - 1]?.percent === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4 h-[300px] flex flex-col items-center justify-center text-center">
        <Clock className="w-8 h-8 text-slate-600 mb-2" />
        <h3 className="text-base font-bold text-white">Срок жизни контента (LTV)</h3>
        <p className="text-sm text-slate-400 max-w-sm">
          Недостаточно исторических данных. График появится после того, как сборщик соберет несколько снапшотов для новых постов.
        </p>
      </div>
    );
  }

  const hour80 = data.find(d => d.percent >= 80)?.hour || 0;

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Срок жизни контента (LTV)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Как быстро пост набирает просмотры после публикации (усреднено)</p>
        </div>
        {hour80 > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-emerald-400 text-xs font-medium">
            80% просмотров за {hour80} ч.
          </div>
        )}
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPercent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="hour" stroke="#475569" fontSize={12} tickLine={false} tickFormatter={(val) => `${val}ч`} />
            <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem' }}
              itemStyle={{ color: '#f8fafc' }}
              formatter={(value: number) => [`${value}%`, 'Набрано просмотров']}
              labelFormatter={(label) => `Прошло ${label} ч.`}
            />
            {hour80 > 0 && (
              <ReferenceLine x={hour80} stroke="#10b981" strokeDasharray="3 3" />
            )}
            <ReferenceLine y={80} stroke="#475569" strokeDasharray="3 3" />
            <Area type="monotone" dataKey="percent" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorPercent)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
