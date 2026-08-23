import React from 'react';
import { Users, User, Heart, Zap, Crosshair, BrainCircuit, Activity } from 'lucide-react';

export interface AIAudienceData {
  demographics: {
    age: string;
    gender: string;
    income: string;
    geo: string;
  };
  psychographics: {
    interests: string[];
    values: string[];
    fears: string[];
  };
  behavior: {
    contentConsumption: string;
    engagementReason: string;
  };
  summary: string;
}

interface Props {
  data: AIAudienceData;
}

export function AIAudienceReport({ data }: Props) {
  return (
    <div className="bg-[#07111f] rounded-3xl p-6 sm:p-10 border border-[#1b5241] text-[#edf4fb] space-y-12 relative overflow-hidden">
      
      {/* Background decoration */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none"></div>

      {/* 1. Header */}
      <section className="relative z-10 text-center sm:text-left flex flex-col sm:flex-row gap-6 items-center sm:items-start justify-between bg-gradient-to-r from-[#0d2f1f] to-[#07111f] border border-[#1b5241] rounded-3xl p-8 shadow-lg">
        <div>
          <div className="flex items-center justify-center sm:justify-start gap-2 text-emerald-400 mb-3">
            <Users className="w-6 h-6" />
            <span className="text-sm font-bold tracking-widest uppercase">Анализ Целевой Аудитории</span>
          </div>
          <p className="text-lg text-emerald-100 font-medium leading-relaxed max-w-3xl m-0">
            {data.summary}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
        
        {/* 2. Demographics */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight mb-4 text-emerald-300 flex items-center gap-2">
            <User className="w-5 h-5" />
            Демография
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0a1f16] border border-[#1b5241] rounded-2xl p-4 shadow-lg">
              <div className="text-[10px] uppercase font-bold text-emerald-500/80 mb-1">Возраст</div>
              <div className="text-sm font-medium text-emerald-100">{data.demographics?.age || 'Нет данных'}</div>
            </div>
            <div className="bg-[#0a1f16] border border-[#1b5241] rounded-2xl p-4 shadow-lg">
              <div className="text-[10px] uppercase font-bold text-emerald-500/80 mb-1">Пол</div>
              <div className="text-sm font-medium text-emerald-100">{data.demographics?.gender || 'Нет данных'}</div>
            </div>
            <div className="bg-[#0a1f16] border border-[#1b5241] rounded-2xl p-4 shadow-lg">
              <div className="text-[10px] uppercase font-bold text-emerald-500/80 mb-1">Доход</div>
              <div className="text-sm font-medium text-emerald-100">{data.demographics?.income || 'Нет данных'}</div>
            </div>
            <div className="bg-[#0a1f16] border border-[#1b5241] rounded-2xl p-4 shadow-lg">
              <div className="text-[10px] uppercase font-bold text-emerald-500/80 mb-1">География</div>
              <div className="text-sm font-medium text-emerald-100">{data.demographics?.geo || 'Нет данных'}</div>
            </div>
          </div>
        </section>

        {/* 3. Behavior */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight mb-4 text-sky-300 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Поведенческие факторы
          </h2>
          <div className="space-y-3">
            <div className="bg-[#0a192f] border border-[#1b3552] rounded-2xl p-5 shadow-lg">
              <div className="flex items-center gap-2 text-sky-500/80 mb-2">
                <Zap className="w-4 h-4" />
                <span className="text-[10px] uppercase font-bold tracking-wider">Потребление контента</span>
              </div>
              <p className="text-sm text-sky-100 leading-relaxed m-0">{data.behavior?.contentConsumption}</p>
            </div>
            <div className="bg-[#0a192f] border border-[#1b3552] rounded-2xl p-5 shadow-lg">
              <div className="flex items-center gap-2 text-sky-500/80 mb-2">
                <Crosshair className="w-4 h-4" />
                <span className="text-[10px] uppercase font-bold tracking-wider">Причина подписки</span>
              </div>
              <p className="text-sm text-sky-100 leading-relaxed m-0">{data.behavior?.engagementReason}</p>
            </div>
          </div>
        </section>
      </div>

      {/* 4. Psychographics */}
      <section className="relative z-10">
        <h2 className="text-xl font-bold tracking-tight mb-4 text-purple-300 flex items-center gap-2">
          <BrainCircuit className="w-5 h-5" />
          Психографика
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-purple-950/20 border border-purple-900/30 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center gap-2 text-purple-400 mb-3">
              <Heart className="w-4 h-4" />
              <span className="text-[10px] uppercase font-bold tracking-wider">Интересы</span>
            </div>
            <ul className="space-y-2 m-0 pl-0 list-none">
              {(data.psychographics?.interests || []).map((item, i) => (
                <li key={i} className="text-sm text-purple-100 flex items-start gap-2">
                  <span className="text-purple-500 mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="bg-purple-950/20 border border-purple-900/30 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center gap-2 text-purple-400 mb-3">
              <Zap className="w-4 h-4" />
              <span className="text-[10px] uppercase font-bold tracking-wider">Ценности</span>
            </div>
            <ul className="space-y-2 m-0 pl-0 list-none">
              {(data.psychographics?.values || []).map((item, i) => (
                <li key={i} className="text-sm text-purple-100 flex items-start gap-2">
                  <span className="text-purple-500 mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-rose-950/10 border border-rose-900/20 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center gap-2 text-rose-400 mb-3">
              <Activity className="w-4 h-4" />
              <span className="text-[10px] uppercase font-bold tracking-wider">Боли и страхи</span>
            </div>
            <ul className="space-y-2 m-0 pl-0 list-none">
              {(data.psychographics?.fears || []).map((item, i) => (
                <li key={i} className="text-sm text-rose-100 flex items-start gap-2">
                  <span className="text-rose-500 mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

    </div>
  );
}
