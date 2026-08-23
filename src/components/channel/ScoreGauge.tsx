'use client';

import { Activity } from 'lucide-react';
import { ScoreBreakdown } from '@/lib/scoring';

interface ScoreGaugeProps {
  breakdown: ScoreBreakdown;
}

export function ScoreGauge({ breakdown }: ScoreGaugeProps) {
  const { total, grade, recommendation } = breakdown;

  let color = '#ef4444'; // red (D)
  if (total >= 90) color = '#10b981'; // green (A+)
  else if (total >= 80) color = '#34d399'; // light green (A)
  else if (total >= 70) color = '#fbbf24'; // yellow (B)
  else if (total >= 60) color = '#f97316'; // orange (C)

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (total / 100) * circumference;

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row gap-6 items-center sm:items-start">
      <div className="flex-shrink-0 relative flex items-center justify-center w-32 h-32">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            className="text-slate-800"
          />
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke={color}
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>{grade}</span>
          <span className="text-xs text-slate-400 font-medium">{total}/100</span>
        </div>
      </div>

      <div className="flex-1 space-y-4 w-full">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Content Score
          </h3>
          <p className="text-sm text-slate-300 mt-1">{recommendation}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[
            breakdown.errScore,
            breakdown.consistencyScore,
            breakdown.growthScore,
            breakdown.engagementScore,
            breakdown.originalityScore
          ].map((item, idx) => (
            <div key={idx} className="flex justify-between items-center bg-slate-800/50 rounded-lg p-2 px-3">
              <span className="text-slate-400">{item.label}</span>
              <span className="font-semibold text-white">{item.score} <span className="text-slate-500 font-normal">/ {item.max}</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
