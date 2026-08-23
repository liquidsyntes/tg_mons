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
            РЇРґСЂРѕ Р»РёС‡РЅРѕСЃС‚Рё
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
              <span className="block text-xs text-slate-400 mb-1">РђСЂС…РµС‚РёРї</span>
              <span className="font-medium text-slate-200">{data.corePersonality.archetype}</span>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
              <span className="block text-xs text-slate-400 mb-1">BDSM Р РѕР»СЊ / РЎРєР»РѕРЅРЅРѕСЃС‚СЊ</span>
              <span className="font-medium text-rose-300">{data.corePersonality.bdsmRole}</span>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
              <span className="block text-xs text-slate-400 mb-1">РЈСЂРѕРІРµРЅСЊ РґРѕРјРёРЅР°РЅС‚РЅРѕСЃС‚Рё</span>
              <span className="font-medium text-slate-200">{data.corePersonality.dominanceLevel}</span>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
              <span className="block text-xs text-slate-400 mb-1">РўРµРјРїРµСЂР°РјРµРЅС‚</span>
              <span className="font-medium text-slate-200">{data.corePersonality.temperament}</span>
            </div>
            {data.corePersonality.narcissismLevel && (
              <div className="bg-rose-950/40 rounded-lg p-3 border border-rose-900/50 col-span-1 sm:col-span-2 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-rose-900/50 text-rose-300 font-black text-xl border border-rose-500/30">
                  {data.corePersonality.narcissismLevel.score}
                </div>
                <div>
                  <span className="block text-xs text-rose-400 uppercase tracking-wider font-bold mb-1">РЁРєР°Р»Р° РЅР°СЂС†РёСЃСЃРёР·РјР°: {data.corePersonality.narcissismLevel.status}</span>
                  <p className="text-sm text-rose-200/80 leading-snug">{data.corePersonality.narcissismLevel.reasoning}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Psychological Traits */}
      {data.psychologicalTraits && (
        <div className="space-y-3">
          <h4 className="text-white font-semibold flex items-center gap-2 border-b border-rose-500/30 pb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            РџСЃРёС…РѕР»РѕРіРёС‡РµСЃРєРёРµ С‡РµСЂС‚С‹
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <span className="block text-xs text-emerald-400 font-semibold uppercase tracking-wider">РЎРёР»СЊРЅС‹Рµ СЃС‚РѕСЂРѕРЅС‹</span>
              <ul className="space-y-1.5">
                {(data.psychologicalTraits.strengths || []).map((s: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">вЂў</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <span className="block text-xs text-rose-400 font-semibold uppercase tracking-wider">РЎР»Р°Р±РѕСЃС‚Рё / РўРµРЅРё</span>
              <ul className="space-y-1.5">
                {(data.psychologicalTraits.weaknesses || []).map((w: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-rose-500 mt-0.5">вЂў</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <span className="block text-xs text-amber-400 font-semibold uppercase tracking-wider">РўСЂРёРіРіРµСЂС‹</span>
              <ul className="space-y-1.5">
                {(data.psychologicalTraits.triggers || []).map((t: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">вЂў</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Fears */}
      {data.fears && (
        <div className="space-y-3">
          <h4 className="text-white font-semibold flex items-center gap-2 border-b border-rose-500/30 pb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            РЎС‚СЂР°С…Рё Рё РєРѕРјРїРµРЅСЃР°С†РёРё
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-800/20 rounded-xl p-4 border border-slate-700/30">
              <span className="block text-xs text-rose-400 font-semibold uppercase mb-2">РџСЂРѕРіРѕРІР°СЂРёРІР°РµРјС‹Рµ СЃС‚СЂР°С…Рё</span>
              <ul className="space-y-1 text-slate-300 text-sm">
                {(data.fears.explicitFears || []).map((f: string, i: number) => <li key={i}>вЂў {f}</li>)}
              </ul>
            </div>
            <div className="bg-slate-800/20 rounded-xl p-4 border border-slate-700/30">
              <span className="block text-xs text-rose-500 font-semibold uppercase mb-2">РЎРєСЂС‹С‚С‹Рµ СЃС‚СЂР°С…Рё</span>
              <ul className="space-y-1 text-slate-300 text-sm">
                {(data.fears.hiddenFears || []).map((f: string, i: number) => <li key={i}>вЂў {f}</li>)}
              </ul>
            </div>
            <div className="col-span-1 md:col-span-2 bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
              <span className="block text-xs text-slate-400 font-semibold uppercase mb-1">РљРѕСѓРїРёРЅРі-РјРµС…Р°РЅРёР·Рј (Р—Р°С‰РёС‚Р°)</span>
              <p className="text-slate-200">{data.fears.copingMechanism}</p>
            </div>
          </div>
        </div>
      )}

      {/* Money and Success Attitude */}
      {data.moneyAndSuccessAttitude && (
        <div className="space-y-3">
          <h4 className="text-white font-semibold flex items-center gap-2 border-b border-amber-500/30 pb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Р”РµРЅСЊРіРё Рё РЈСЃРїРµС…
          </h4>
          <div className="space-y-3 bg-amber-950/10 rounded-xl p-4 border border-amber-900/30">
            <div>
              <span className="block text-xs text-amber-500/80 mb-1">РћС‚РЅРѕС€РµРЅРёРµ Рє РґРµРЅСЊРіР°Рј</span>
              <p className="text-slate-200">{data.moneyAndSuccessAttitude.relationToMoney}</p>
            </div>
            <div className="pt-2 border-t border-amber-900/30">
              <span className="block text-xs text-amber-500/80 mb-1">РњР°СЂРєРµСЂС‹ СѓСЃРїРµС…Р°</span>
              <p className="text-slate-200">{data.moneyAndSuccessAttitude.relationToSuccess}</p>
            </div>
            <div className="pt-2 border-t border-amber-900/30">
              <span className="block text-xs text-amber-500/80 mb-1">РЈСЂРѕРІРµРЅСЊ С„Р»РµРєСЃР° (РґРµРјРѕРЅСЃС‚СЂР°С‚РёРІРЅРѕСЃС‚Рё)</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-full bg-slate-800 rounded-full h-2.5 max-w-xs">
                  <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: `${(Number(data.moneyAndSuccessAttitude.flexingLevel) || 0) * 10}%` }}></div>
                </div>
                <span className="text-amber-400 font-bold">{data.moneyAndSuccessAttitude.flexingLevel}/10</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Communication Style */}
      {data.communicationStyle && (
        <div className="space-y-3">
          <h4 className="text-white font-semibold flex items-center gap-2 border-b border-rose-500/30 pb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            РЎС‚РёР»СЊ РѕР±С‰РµРЅРёСЏ
          </h4>
          <div className="space-y-3 bg-slate-800/20 rounded-xl p-4 border border-slate-700/30">
            <div>
              <span className="block text-xs text-slate-400 mb-1">РўРѕРЅ РѕР±С‰РµРЅРёСЏ</span>
              <p>{data.communicationStyle.tone}</p>
            </div>
            <div className="pt-2 border-t border-slate-700/30">
              <span className="block text-xs text-slate-400 mb-1">РњР°РЅРёРїСѓР»СЏС†РёРё Рё РїРѕРѕС‰СЂРµРЅРёСЏ</span>
              <p>{data.communicationStyle.manipulation}</p>
            </div>
            <div className="pt-2 border-t border-slate-700/30">
              <span className="block text-xs text-slate-400 mb-1">Р›РёС‡РЅС‹Рµ РіСЂР°РЅРёС†С‹</span>
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
    md += '- **Архетип:** ' + data.corePersonality.archetype + '\n';
    md += '- **BDSM Роль / Склонность:** ' + data.corePersonality.bdsmRole + '\n';
    md += '- **Уровень доминантности:** ' + data.corePersonality.dominanceLevel + '\n';
    md += '- **Темперамент:** ' + data.corePersonality.temperament + '\n';
    if (data.corePersonality.narcissismLevel) {
      md += '- **Шкала нарциссизма:** ' + data.corePersonality.narcissismLevel.score + '/100 (' + data.corePersonality.narcissismLevel.status + ')\n';
      md += '  *' + data.corePersonality.narcissismLevel.reasoning + '*\n';
    }
    md += '\n';
  }

  if (data.psychologicalTraits) {
    md += '## Психологические черты\n';
    md += '### Сильные стороны\n';
    (data.psychologicalTraits.strengths || []).forEach((s: string) => md += '- ' + s + '\n');
    md += '\n### Слабости / Тени\n';
    (data.psychologicalTraits.weaknesses || []).forEach((w: string) => md += '- ' + w + '\n');
    md += '\n### Триггеры\n';
    (data.psychologicalTraits.triggers || []).forEach((t: string) => md += '- ' + t + '\n');
    md += '\n';
  }

  if (data.fears) {
    md += '## Страхи и компенсации\n';
    md += '### Проговариваемые страхи\n';
    (data.fears.explicitFears || []).forEach((s: string) => md += '- ' + s + '\n');
    md += '\n### Скрытые страхи\n';
    (data.fears.hiddenFears || []).forEach((w: string) => md += '- ' + w + '\n');
    md += '\n### Коупинг-механизм (Защита)\n';
    md += data.fears.copingMechanism + '\n\n';
  }

  if (data.moneyAndSuccessAttitude) {
    md += '## Деньги и Успех\n';
    md += '- **Отношение к деньгам:** ' + data.moneyAndSuccessAttitude.relationToMoney + '\n';
    md += '- **Маркеры успеха:** ' + data.moneyAndSuccessAttitude.relationToSuccess + '\n';
    md += '- **Уровень флекса:** ' + data.moneyAndSuccessAttitude.flexingLevel + '/10\n\n';
  }

  if (data.communicationStyle) {
    md += '## Стиль общения\n';
    md += '- **Тон:** ' + data.communicationStyle.tone + '\n';
    md += '- **Манипуляции:** ' + data.communicationStyle.manipulation + '\n';
    md += '- **Личные границы:** ' + data.communicationStyle.boundaries + '\n\n';
  }

  if (data.summary) {
    md += '## Резюме\n';
    md += '> ' + data.summary + '\n';
  }

  return md;
}
