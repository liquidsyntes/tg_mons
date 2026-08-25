'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Activity, Plus, RefreshCw, Radio, Check, AlertCircle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface HeaderProps {
  lastGlobalUpdate?: string | null;
  totalChannels?: number;
  activeChannels?: number;
  onOpenAddModal?: () => void;
  onRefresh?: () => Promise<void>;
}

export function Header({
  lastGlobalUpdate = null,
  totalChannels = 0,
  activeChannels = 0,
  onOpenAddModal,
  onRefresh,
}: HeaderProps) {
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectMessage, setCollectMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const handleTriggerCollect = async () => {
    setIsCollecting(true);
    setCollectMessage(null);
    try {
      const res = await fetch('/api/collect/run', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка запуска сбора');
      }
      setCollectMessage({ text: 'Сбор завершен успешно!' });
      await onRefresh?.();
    } catch (err: any) {
      setCollectMessage({ text: err.message || 'Ошибка сбора', isError: true });
    } finally {
      setIsCollecting(false);
      setTimeout(() => setCollectMessage(null), 4000);
    }
  };

  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Левая часть хедера: Логотип, название проекта и навигация */}
        <div className="flex items-center gap-3">
          
          {/* Блок с логотипом и названием (ведет на главную) */}
          <Link href="/" className="flex items-center gap-2.5 group">
            
            {/* Иконка / Логотип проекта (tg_mon_logo.png) */}
            <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center">
              <Image src="/tg_mon_logo.png" alt="TG Monitor Logo" width={36} height={36} className="w-full h-full object-contain" />
            </div>
            
            {/* Текстовая часть: Название проекта и бейдж (Live/EF) */}
            <div>
              <span className="font-bold text-lg tracking-tight text-white flex items-center gap-[26px]">
                TG Monitor
                <img src="/ef.png" alt="Live Badge" className="h-[22px] w-auto object-contain" />
              </span>
            </div>
          </Link>
          
          {/* Вертикальный разделитель (линия) */}
          <div className="hidden sm:block w-px h-5 bg-border ml-3 mr-1"></div>
          
          {/* Ссылка на раздел с AI Отчетами */}
          <Link href="/reports" className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
            AI Отчеты
          </Link>
        </div>

        {/* Правая часть хедера: Статусы и кнопки действий */}
        <div className="flex items-center gap-2 sm:gap-4">
          
          {/* Информация о статусе работы: сколько каналов мониторится и когда было последнее обновление */}
          <div className="hidden lg:flex items-center gap-3 text-xs text-slate-400 font-mono border-r border-border pr-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              {activeChannels} из {totalChannels} активны
            </span>
            <span>•</span>
            <span>Обновлено: {formatRelativeTime(lastGlobalUpdate)}</span>
          </div>

          {/* Всплывающее уведомление о статусе ручного сбора данных (успех/ошибка) */}
          {collectMessage && (
            <div
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs ${
                collectMessage.isError
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {collectMessage.isError ? (
                <AlertCircle className="w-3.5 h-3.5" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>{collectMessage.text}</span>
            </div>
          )}

          {/* Кнопка принудительного обновления данных по каналам */}
          {onRefresh && (
            <button
              onClick={handleTriggerCollect}
              disabled={isCollecting}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-border transition-colors disabled:opacity-50"
              title="Запустить цикл сбора данных вручную"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCollecting ? 'animate-spin text-accent' : ''}`} />
              <span className="hidden sm:inline">
                {isCollecting ? 'Сбор...' : 'Собрать сейчас'}
              </span>
            </button>
          )}

          {/* Главная целевая кнопка: добавление нового канала для мониторинга */}
          {onOpenAddModal && (
            <button
              onClick={onOpenAddModal}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent-hover text-slate-950 transition-colors shadow-sm shadow-accent/20"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Добавить канал</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
