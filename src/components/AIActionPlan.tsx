import React from 'react';
import { ListTodo, Clock, ChevronRight, CheckCircle } from 'lucide-react';

export interface AIActionPlanData {
  title: string;
  estimatedTime: string;
  steps: {
    stepNumber: number;
    title: string;
    description: string;
    expectedResult: string;
  }[];
}

interface Props {
  data: AIActionPlanData;
}

export function AIActionPlan({ data }: Props) {
  return (
    <div className="bg-[#07111f] rounded-3xl p-6 sm:p-10 border border-[#231b52] text-[#edf4fb] space-y-12 relative overflow-hidden">
      
      {/* Background decoration */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none"></div>

      {/* 1. Header */}
      <section className="relative z-10 text-center sm:text-left flex flex-col sm:flex-row gap-6 items-center sm:items-start justify-between bg-gradient-to-r from-[#100d2f] to-[#07111f] border border-[#231b52] rounded-3xl p-8 shadow-lg">
        <div>
          <div className="flex items-center justify-center sm:justify-start gap-2 text-cyan-400 mb-3">
            <ListTodo className="w-6 h-6" />
            <span className="text-sm font-bold tracking-widest uppercase">Пошаговое руководство</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white m-0">
            {data.title}
          </h2>
        </div>
        <div className="shrink-0 flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 px-4 py-2 rounded-xl text-sm font-semibold">
          <Clock className="w-4 h-4" />
          Сроки: {data.estimatedTime}
        </div>
      </section>

      {/* 2. Steps Timeline */}
      <section className="relative z-10">
        <div className="space-y-6">
          {data.steps.map((step, i) => (
            <div key={i} className="relative flex flex-col md:flex-row gap-6 bg-[#100d2f] border border-[#231b52] hover:border-cyan-500/50 transition-colors rounded-3xl p-6 sm:p-8 shadow-lg group">
              
              <div className="flex flex-col items-center shrink-0">
                <div className="w-14 h-14 rounded-2xl bg-[#07111f] border border-[#231b52] group-hover:border-cyan-500/50 group-hover:bg-cyan-500/10 flex items-center justify-center text-xl font-black text-cyan-400 shadow-inner transition-colors">
                  {step.stepNumber}
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <h3 className="text-xl font-bold text-white leading-tight m-0 group-hover:text-cyan-200 transition-colors">
                  {step.title}
                </h3>
                
                <p className="text-[15px] leading-relaxed text-[#a39fcc] m-0">
                  {step.description}
                </p>

                <div className="bg-cyan-950/20 border border-cyan-900/30 rounded-xl p-4 flex gap-3 items-start">
                  <CheckCircle className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-cyan-500/80 uppercase tracking-widest mb-1">Ожидаемый результат</div>
                    <div className="text-sm text-cyan-100/90 leading-relaxed">{step.expectedResult}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      
    </div>
  );
}
