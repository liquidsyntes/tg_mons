'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Compass,
  Info,
  Lightbulb,
  Link2,
  ListChecks,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Header } from '@/components/Header';
import {
  ANTIFRAUD_HEURISTICS_GUIDE,
  CHANNELS_TABLE_COLUMNS_GUIDE,
  HELP_CHAPTERS,
  HELP_ROLE_LABELS,
  filterHelpChapters,
  getAllHelpSections,
  type HelpUserRole,
} from '@/lib/help/help-content';

const ROLE_OPTIONS: Array<{ id: HelpUserRole | 'all'; label: string }> = [
  { id: 'all', label: 'Все роли' },
  { id: 'owner', label: HELP_ROLE_LABELS.owner },
  { id: 'buyer', label: HELP_ROLE_LABELS.buyer },
  { id: 'editor', label: HELP_ROLE_LABELS.editor },
];

export function HelpCenterClient() {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<HelpUserRole | 'all'>('all');
  const [activeSectionId, setActiveSectionId] = useState<string>('quick-start');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const allSectionsCount = useMemo(() => getAllHelpSections().length, []);

  const filteredChapters = useMemo(
    () => filterHelpChapters({ query, role }),
    [query, role],
  );

  const visibleSectionsCount = useMemo(
    () => filteredChapters.reduce((acc, chapter) => acc + chapter.sections.length, 0),
    [filteredChapters],
  );

  const hasFilters = query.trim().length > 0 || role !== 'all';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hashId = window.location.hash.replace(/^#/, '');
    if (hashId) {
      setActiveSectionId(hashId);
    }

    const handleHashChange = () => {
      const nextHash = window.location.hash.replace(/^#/, '');
      if (nextHash) {
        setActiveSectionId(nextHash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const sectionIds = filteredChapters.flatMap((chapter) =>
      chapter.sections.map((section) => section.id),
    );
    if (sectionIds.length === 0) return;

    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) {
          setActiveSectionId(visible[0].target.id);
        }
      },
      { rootMargin: '-96px 0px -65% 0px', threshold: 0.1 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [filteredChapters]);

  const handleResetFilters = () => {
    setQuery('');
    setRole('all');
  };

  const handleCopyLink = async (sectionId: string) => {
    const shareUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/help#${sectionId}`
        : `/help#${sectionId}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setCopiedId(sectionId);
      setTimeout(() => {
        setCopiedId((current) => (current === sectionId ? null : current));
      }, 2000);
    } catch {
      setCopiedId(sectionId);
    }
  };

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      <Header />
      <main className="flex-1 site-shell w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Верхняя шапка и поиск */}
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Руководство пользователя TG Monitor</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Справка по блокам и метрикам сервиса
              </h1>
              <p className="text-sm text-slate-400 max-w-3xl">
                Для чего нужен каждый виджет, как рассчитываются показатели, на какие пороги смотреть и как применять данные на практике.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 text-xs font-mono">
              <span className="rounded-lg border border-border bg-slate-900/80 px-3 py-1.5 text-slate-300">
                Глав: <strong className="text-white">{HELP_CHAPTERS.length}</strong>
              </span>
              <span className="rounded-lg border border-border bg-slate-900/80 px-3 py-1.5 text-slate-300">
                Разделов: <strong className="text-accent">{visibleSectionsCount}</strong> / {allSectionsCount}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Поиск по справочнику"
                placeholder="Поиск по терминам, метрикам и блокам (Last Fact, RiskBadge, LTV, CPM)..."
                className="w-full rounded-xl border border-border bg-slate-950/70 pl-9 pr-9 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Очистить поиск"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {hasFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                Сбросить фильтры
              </button>
            )}
          </div>

          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Фильтр по роли"
          >
            {ROLE_OPTIONS.map((option) => {
              const active = role === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setRole(option.id)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    active
                      ? 'bg-accent text-slate-950 border-accent'
                      : 'bg-slate-900/70 text-slate-300 border-border hover:border-slate-600 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Компактная полоса глав и оглавление для мобильного и планшетного экрана */}
        {filteredChapters.length > 0 && (
          <div className="lg:hidden space-y-2">
            <nav
              aria-label="Быстрый переход по главам"
              className="rounded-xl border border-border bg-surface p-2 overflow-x-auto"
            >
              <div className="flex items-center gap-1.5 min-w-max">
                {filteredChapters.map((chapter) => (
                  <a
                    key={chapter.id}
                    href={`#${chapter.id}`}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap text-slate-300 hover:text-white hover:bg-slate-800 border border-border/70 transition-colors"
                  >
                    {chapter.number}. {chapter.title}
                  </a>
                ))}
              </div>
            </nav>

            <details className="rounded-xl border border-border bg-surface p-3">
              <summary className="cursor-pointer text-xs font-semibold text-white flex items-center justify-between">
                <span>Полное оглавление ({visibleSectionsCount} разделов)</span>
                <span className="text-slate-400">раскрыть</span>
              </summary>
              <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                {filteredChapters.map((chapter) => (
                  <div key={chapter.id} className="space-y-1">
                    <div className="text-xs font-bold text-slate-200">
                      {chapter.number}. {chapter.title}
                    </div>
                    <ul className="space-y-1 pl-2">
                      {chapter.sections.map((section) => (
                        <li key={section.id}>
                          <a
                            href={`#${section.id}`}
                            onClick={() => setActiveSectionId(section.id)}
                            className="block text-xs text-slate-400 hover:text-accent py-0.5"
                          >
                            {section.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* Основной двухколоночный контент */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Левое липкое оглавление (Desktop) */}
          <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 lg:sticky lg:top-20">
            <nav
              aria-label="Оглавление справочника"
              className="rounded-2xl border border-border bg-surface p-4 max-h-[calc(100vh-6rem)] overflow-y-auto space-y-4"
            >
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border/70">
                <Compass className="w-4 h-4 text-accent" />
                <span>Оглавление</span>
              </div>

              {filteredChapters.length === 0 ? (
                <p className="text-xs text-slate-500">Нет разделов по текущему фильтру.</p>
              ) : (
                <div className="space-y-4">
                  {filteredChapters.map((chapter) => (
                    <div key={chapter.id} className="space-y-1.5">
                      <a
                        href={`#${chapter.id}`}
                        className="block text-xs font-bold text-white hover:text-accent transition-colors"
                      >
                        {chapter.number}. {chapter.title}
                      </a>
                      <ul className="space-y-0.5 border-l border-border/80 pl-2.5">
                        {chapter.sections.map((section) => {
                          const isActive = activeSectionId === section.id;
                          return (
                            <li key={section.id}>
                              <a
                                href={`#${section.id}`}
                                onClick={() => setActiveSectionId(section.id)}
                                className={`block rounded-lg px-2 py-1 text-xs transition-colors ${
                                  isActive
                                    ? 'bg-accent/15 text-accent font-semibold'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                                }`}
                              >
                                {section.title}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </nav>
          </aside>

          {/* Правая колонка с главами и паспортами блоков */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-8 min-w-0">
            {filteredChapters.length === 0 ? (
              <div className="rounded-2xl border border-border bg-surface p-10 text-center space-y-3">
                <Search className="w-8 h-8 text-slate-500 mx-auto" />
                <h2 className="text-lg font-bold text-white">Ничего не найдено</h2>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  По запросу «{query}» для выбранной роли подходящих разделов не обнаружено.
                </p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent hover:bg-accent-hover text-slate-950 font-semibold px-4 py-2 text-xs transition-colors"
                >
                  Сбросить поиск и фильтры
                </button>
              </div>
            ) : (
              filteredChapters.map((chapter) => (
                <section
                  key={chapter.id}
                  id={chapter.id}
                  className="scroll-mt-24 space-y-4"
                >
                  <div className="rounded-2xl border border-border bg-slate-900/60 px-5 py-4">
                    <div className="text-xs font-mono uppercase tracking-wider text-accent font-bold">
                      Глава {chapter.number}
                    </div>
                    <h2 className="text-xl font-extrabold text-white mt-0.5">
                      {chapter.title}
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">{chapter.summary}</p>
                  </div>

                  <div className="space-y-4">
                    {chapter.sections.map((section) => {
                      const canOpenRoute =
                        section.routeHint && !section.routeHint.includes('[id]');
                      return (
                        <article
                          key={section.id}
                          id={section.id}
                          className="scroll-mt-24 rounded-2xl border border-border bg-surface p-5 sm:p-6 space-y-4"
                        >
                          {/* Заголовок раздела */}
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-border/70 pb-4">
                            <div className="space-y-2 min-w-0">
                              <h3 className="text-lg font-bold text-white">
                                {section.title}
                              </h3>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {section.roles.map((r) => (
                                  <span
                                    key={r}
                                    className="rounded-md border border-border bg-slate-900/80 px-2 py-0.5 text-[11px] font-medium text-slate-300"
                                  >
                                    {HELP_ROLE_LABELS[r]}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {canOpenRoute && (
                                <Link
                                  href={section.routeHint!}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors"
                                >
                                  <span>{'Открыть раздел ->'}</span>
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleCopyLink(section.id)}
                                aria-label={`Скопировать ссылку на ${section.title}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors"
                              >
                                {copiedId === section.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-emerald-400">Скопировано</span>
                                  </>
                                ) : (
                                  <>
                                    <Link2 className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Ссылка</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Краткое резюме */}
                          <p className="rounded-xl border border-accent/25 bg-accent/5 px-3.5 py-2.5 text-sm text-slate-200">
                            {section.shortSummary}
                          </p>

                          {/* Зачем нужен и как работает */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded-xl border border-border/80 bg-slate-900/50 p-3.5 space-y-1.5">
                              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-400">
                                <Info className="w-3.5 h-3.5" />
                                <span>Зачем нужен блок</span>
                              </div>
                              <p className="text-sm text-slate-300 leading-relaxed">
                                {section.purpose}
                              </p>
                            </div>

                            <div className="rounded-xl border border-border/80 bg-slate-900/50 p-3.5 space-y-1.5">
                              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-violet-400">
                                <Compass className="w-3.5 h-3.5" />
                                <span>Как это работает</span>
                              </div>
                              <p className="text-sm text-slate-300 leading-relaxed">
                                {section.howItWorks}
                              </p>
                            </div>
                          </div>

                          {/* Пошаговое использование */}
                          <div className="rounded-xl border border-border/80 bg-slate-900/30 p-4 space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200">
                              <ListChecks className="w-4 h-4 text-accent" />
                              <span>Как пользоваться (по шагам)</span>
                            </div>
                            <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-300">
                              {section.steps.map((step, idx) => (
                                <li key={idx} className="leading-relaxed">
                                  {step}
                                </li>
                              ))}
                            </ol>
                          </div>

                          {/* Практический пример */}
                          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                              <Lightbulb className="w-4 h-4" />
                              <span>Пример разбора на практике</span>
                            </div>
                            <p className="text-sm text-slate-200 leading-relaxed">
                              {section.example}
                            </p>
                          </div>

                          {/* Встроенная шпаргалка 12 колонок таблицы каналов */}
                          {section.id === 'channels-table' && (
                            <div className="space-y-2.5 pt-1">
                              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                                Словарь всех 12 колонок главной таблицы
                              </div>
                              <div className="overflow-x-auto rounded-xl border border-border">
                                <table className="w-full min-w-[680px] text-left text-xs">
                                  <thead className="bg-slate-900/90 text-slate-400 uppercase font-mono">
                                    <tr>
                                      <th className="py-2.5 px-3">Колонка</th>
                                      <th className="py-2.5 px-3">Расшифровка</th>
                                      <th className="py-2.5 px-3">Что показывает</th>
                                      <th className="py-2.5 px-3">Пороги и акценты</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/70 bg-slate-950/40">
                                    {CHANNELS_TABLE_COLUMNS_GUIDE.map((item) => (
                                      <tr key={item.column}>
                                        <td className="py-2.5 px-3 font-mono font-bold text-accent whitespace-nowrap">
                                          {item.column}
                                        </td>
                                        <td className="py-2.5 px-3 font-medium text-white">
                                          {item.fullName}
                                        </td>
                                        <td className="py-2.5 px-3 text-slate-300">
                                          {item.meaning}
                                        </td>
                                        <td className="py-2.5 px-3 text-slate-400">
                                          {item.thresholds}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Встроенный визуальный пример цветов RiskBadge */}
                          {section.id === 'antifraud-score' && (
                            <div className="rounded-xl border border-border bg-slate-900/50 p-4 space-y-3">
                              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                                Шкала цветов RiskBadge в интерфейсе
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  Risk: 0% · Проверки: 6/6 (чисто)
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-400">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Risk: 25% · 1 эвристика (проверить контекст)
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-400">
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  Risk: 50%+ · 2+ сигнала (высокий риск)
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-500/30 bg-slate-500/15 px-2.5 py-1 text-xs font-semibold text-slate-300">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                                  Недостаточно данных (0/6)
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Встроенная шпаргалка 7 эвристик антифрода */}
                          {section.id === 'antifraud-heuristics' && (
                            <div className="space-y-3 pt-1">
                              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                                Справочник всех 7 проверок антифрода
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {ANTIFRAUD_HEURISTICS_GUIDE.map((item) => (
                                  <div
                                    key={item.id}
                                    className="rounded-xl border border-border bg-slate-900/60 p-3.5 space-y-2 text-xs"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <h4 className="font-bold text-white">{item.title}</h4>
                                      <span className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] text-rose-300">
                                        {item.weight}
                                      </span>
                                    </div>
                                    <p className="text-slate-300">
                                      <strong className="text-slate-200">Что проверяет:</strong>{' '}
                                      {item.whatChecks}
                                    </p>
                                    <p className="text-amber-300/90">
                                      <strong className="text-amber-200">Когда срабатывает:</strong>{' '}
                                      {item.whenTriggers}
                                    </p>
                                    <p className="text-slate-400">
                                      <strong className="text-slate-200">Как перепроверить:</strong>{' '}
                                      {item.howToVerify}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Ограничения и нюансы */}
                          {section.limitations.length > 0 && (
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-1.5">
                              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Важные нюансы и ограничения</span>
                              </div>
                              <ul className="list-disc list-inside space-y-1 text-xs text-slate-300">
                                {section.limitations.map((item, idx) => (
                                  <li key={idx} className="leading-relaxed">
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
