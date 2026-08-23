'use client';

import { User } from 'lucide-react';

interface AIPersonaReportProps {
  data: any;
}

export function AIPersonaReport({ data }: AIPersonaReportProps) {
  if (!data) return null;

  return (
    <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
      
      {/* Core Personality */}
      {data.corePersonality && (
        <div className="space-y-3">
          <h4 className="text-white font-semibold flex items-center gap-2 border-b border-rose-500/30 pb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Ядро личности
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
              <span className="block text-xs text-slate-400 mb-1">Архетип</span>
              <span className="font-medium text-slate-200">{data.corePersonality.archetype}</span>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
              <span className="block text-xs text-slate-400 mb-1">BDSM Роль / Склонность</span>
              <span className="font-medium text-rose-300">{data.corePersonality.bdsmRole}</span>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
              <span className="block text-xs text-slate-400 mb-1">Уровень доминантности</span>
              <span className="font-medium text-slate-200">{data.corePersonality.dominanceLevel}</span>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
              <span className="block text-xs text-slate-400 mb-1">Темперамент</span>
              <span className="font-medium text-slate-200">{data.corePersonality.temperament}</span>
            </div>
          </div>
        </div>
      )}

      {/* Psychological Traits */}
      {data.psychologicalTraits && (
        <div className="space-y-3">
          <h4 className="text-white font-semibold flex items-center gap-2 border-b border-rose-500/30 pb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Психологические черты
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <span className="block text-xs text-emerald-400 font-semibold uppercase tracking-wider">Сильные стороны</span>
              <ul className="space-y-1.5">
                {(data.psychologicalTraits.strengths || []).map((s: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <span className="block text-xs text-rose-400 font-semibold uppercase tracking-wider">Слабости / Тени</span>
              <ul className="space-y-1.5">
                {(data.psychologicalTraits.weaknesses || []).map((w: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-rose-500 mt-0.5">•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <span className="block text-xs text-amber-400 font-semibold uppercase tracking-wider">Триггеры</span>
              <ul className="space-y-1.5">
                {(data.psychologicalTraits.triggers || []).map((t: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Communication Style */}
      {data.communicationStyle && (
        <div className="space-y-3">
          <h4 className="text-white font-semibold flex items-center gap-2 border-b border-rose-500/30 pb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Стиль общения
          </h4>
          <div className="space-y-3 bg-slate-800/20 rounded-xl p-4 border border-slate-700/30">
            <div>
              <span className="block text-xs text-slate-400 mb-1">Тон общения</span>
              <p>{data.communicationStyle.tone}</p>
            </div>
            <div className="pt-2 border-t border-slate-700/30">
              <span className="block text-xs text-slate-400 mb-1">Манипуляции и поощрения</span>
              <p>{data.communicationStyle.manipulation}</p>
            </div>
            <div className="pt-2 border-t border-slate-700/30">
              <span className="block text-xs text-slate-400 mb-1">Личные границы</span>
              <p>{data.communicationStyle.boundaries}</p>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      {data.summary && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-start gap-3">
          <User className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-rose-100 italic">{data.summary}</p>
        </div>
      )}
      
    </div>
  );
}

export function aiPersonaToMarkdown(data: any): string {
  if (!data) return '';
  let md = '# Психологический портрет автора канала (AI Анализ)\n\n';

  if (data.corePersonality) {
    md += '## Ядро личности\n';
    md += `- **Архетип:** ${data.corePersonality.archetype}\n`;
    md += `- **BDSM Роль / Склонность:** ${data.corePersonality.bdsmRole}\n`;
    md += `- **Уровень доминантности:** ${data.corePersonality.dominanceLevel}\n`;
    md += `- **Темперамент:** ${data.corePersonality.temperament}\n\n`;
  }

  if (data.psychologicalTraits) {
    md += '## Психологические черты\n';
    md += '### Сильные стороны\n';
    (data.psychologicalTraits.strengths || []).forEach((s: string) => md += `- ${s}\n`);
    md += '\n### Слабости / Тени\n';
    (data.psychologicalTraits.weaknesses || []).forEach((w: string) => md += `- ${w}\n`);
    md += '\n### Триггеры\n';
    (data.psychologicalTraits.triggers || []).forEach((t: string) => md += `- ${t}\n`);
    md += '\n';
  }

  if (data.communicationStyle) {
    md += '## Стиль общения\n';
    md += `- **Тон:** ${data.communicationStyle.tone}\n`;
    md += `- **Манипуляции:** ${data.communicationStyle.manipulation}\n`;
    md += `- **Личные границы:** ${data.communicationStyle.boundaries}\n\n`;
  }

  if (data.summary) {
    md += '## Резюме\n';
    md += `> ${data.summary}\n`;
  }

  return md;
}
