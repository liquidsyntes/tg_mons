import React from 'react';
import { TrendingUp } from 'lucide-react';

interface TrendItem {
  topic: string;
  description: string;
  channels: string[];
  quote: string;
}

interface TrendData {
  trends: TrendItem[];
  summary: string;
}

export function AITrendReport({ data }: { data: TrendData }) {
  if (!data || !data.trends) return null;
  
  return (
    <div className="space-y-6">
      <div className="p-5 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-sm text-purple-200 leading-relaxed shadow-inner">
        <span className="font-bold text-white block mb-1">Глобальный вывод:</span> 
        {data.summary}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.trends.map((trend, idx) => (
          <div key={idx} className="bg-surface rounded-2xl border border-border p-5 flex flex-col space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              {trend.topic}
            </h3>
            
            <p className="text-sm text-slate-300 flex-1 leading-relaxed">
              {trend.description}
            </p>

            {trend.quote && (
              <div className="pl-4 border-l-2 border-purple-500/40 text-xs text-slate-400 italic bg-slate-900/30 p-2 rounded-r-lg">
                «{trend.quote}»
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2 mt-auto">
              {trend.channels.map((ch, i) => (
                <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-semibold text-slate-300">
                  {ch}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
