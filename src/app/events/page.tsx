'use client';
import { aiRequest } from '@/lib/ai-request';

import React, { useEffect, useState, useMemo } from 'react';
import { AlertCircle, Calendar as CalendarIcon, CheckCircle2, Loader2, RefreshCw, ScanSearch, Search, X } from 'lucide-react';
import { ru } from 'date-fns/locale';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { EventCard, type EventCardData } from '@/components/events/EventCard';
import { Header } from '@/components/Header';
import { HelpPopover } from '@/components/help/HelpPopover';
import { filterEvents, type EventDatePreset } from '@/lib/events/calendar';

const DATE_PRESETS: Array<{ id: EventDatePreset; label: string }> = [
  { id: 'month', label: 'В этом месяце' },
  { id: 'all', label: 'Все предстоящие' },
  { id: 'today_tomorrow', label: 'Сегодня / Завтра' },
  { id: 'weekend', label: 'На этих выходных' },
  { id: 'week', label: 'На этой неделе' },
];

export default function EventsPage() {
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [datePreset, setDatePreset] = useState<EventDatePreset>('month');
  const [searchQuery, setSearchQuery] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  
  const fetchEvents = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/events');
      if (!res.ok) {
        throw new Error('Не удалось загрузить список событий');
      }
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить список событий';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleScan = async () => {
    if (!confirm('Запустить глубокое сканирование постов? Это может занять несколько минут.')) return;
    setScanning(true);
    setStatusBanner(null);
    try {
      const res = await aiRequest('/api/events/scan', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        const screeningNote =
          data.selectionMode === 'keyword_fallback'
            ? ' Jev недоступен: использован прежний отбор по ключевым словам.'
            : '';
        setStatusBanner({
          type: 'success',
          text: `Сканирование завершено. Найдено новых событий: ${data.savedCount}${screeningNote}`,
        });
        await fetchEvents();
      } else {
        setStatusBanner({
          type: 'error',
          text: `Ошибка: ${data.error || data.message || 'Не удалось выполнить сканирование'}`,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Не удалось выполнить сканирование';
      setStatusBanner({ type: 'error', text: `Ошибка: ${message}` });
    } finally {
      setScanning(false);
    }
  };

  const handleDismiss = async (eventId: number) => {
    if (!confirm('Убрать событие из афиши? Оно останется скрытым после повторного сканирования.')) return;
    setDismissingId(eventId);
    setStatusBanner(null);
    try {
      const response = await fetch(`/api/events/${eventId}/dismiss`, { method: 'PATCH' });
      if (!response.ok) throw new Error('Не удалось убрать событие из афиши');
      setEvents(current => current.filter(event => event.id !== eventId));
    } catch (error: unknown) {
      setStatusBanner({
        type: 'error',
        text: error instanceof Error ? error.message : 'Не удалось убрать событие из афиши',
      });
    } finally {
      setDismissingId(null);
    }
  };

  // Extract dates with events for calendar highlighting
  const eventDates = useMemo(() => {
    return events.map(e => new Date(e.date));
  }, [events]);

  // Filter events by preset, search query, and free admission flag
  const selectedEvents = useMemo(() => {
    return filterEvents(events, {
      datePreset,
      selectedMonth: currentMonth,
      query: searchQuery,
      freeOnly,
    });
  }, [events, datePreset, currentMonth, searchQuery, freeOnly]);

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      <Header />
      <main className="flex-1 site-shell w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-[6px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
              <CalendarIcon className="w-6 h-6 shrink-0 text-accent" />
              <span>Календарь событий</span>
              <HelpPopover sectionId="events-calendar" />
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Анонсы мероприятий, автоматически найденные в постах каналов.
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border pt-4 sm:justify-end sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <span className="text-xs font-semibold leading-tight text-slate-400 sm:w-[90px] sm:text-right">
              событий обнаружено
            </span>
            <strong className="text-3xl font-black leading-none tabular-nums text-[#3af89f]" aria-live="polite">
              {loading ? '...' : selectedEvents.length}
            </strong>
          </div>
        </div>

        {statusBanner && (
          <div
            role={statusBanner.type === 'error' ? 'alert' : 'status'}
            className={`rounded-2xl border p-4 flex items-start justify-between gap-3 text-sm ${
              statusBanner.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              {statusBanner.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              )}
              <span className="break-words">{statusBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              aria-label="Закрыть уведомление"
              className="text-slate-400 hover:text-white transition-colors shrink-0 p-0.5 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-[6px] items-start lg:grid-cols-12">
        {/* Left Col: Calendar */}
        <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-[6px]">
          <div className="bg-surface border border-border rounded-2xl p-4 md:p-6 shadow-sm">
            <div className="calendar-wrapper flex justify-center custom-calendar text-slate-200">
              <DayPicker
                month={currentMonth}
                onMonthChange={month => {
                  setCurrentMonth(month);
                  setDatePreset('month');
                }}
                locale={ru}
                modifiers={{ hasEvent: eventDates }}
                modifiersStyles={{
                  hasEvent: {
                    fontWeight: 'bold',
                    color: '#34d399',
                    textDecoration: 'underline',
                    textUnderlineOffset: '4px'
                  }
                }}
                className="!m-0"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-accent hover:bg-accent-hover text-slate-950 font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {scanning ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Сканирование...</>
              ) : (
                <><ScanSearch className="w-4 h-4" /> Сканировать события</>
              )}
            </button>
            <HelpPopover sectionId="events-scanner" align="right" />
          </div>
          
          <style dangerouslySetInnerHTML={{__html: `
            .custom-calendar .rdp-day_selected, 
            .custom-calendar .rdp-day_selected:focus-visible, 
            .custom-calendar .rdp-day_selected:hover {
              background-color: #34d399 !important;
              color: #020617 !important;
              font-weight: bold;
              text-decoration: none !important;
            }
            .custom-calendar .rdp-day:hover:not(.rdp-day_selected) {
              background-color: #1e293b !important;
            }
            .custom-calendar .rdp-button:focus-visible:not(.rdp-day_selected) {
              background-color: #1e293b !important;
            }
            .custom-calendar .rdp-caption_label {
              color: white !important;
              font-weight: bold;
            }
            .custom-calendar .rdp-head_cell {
              color: #64748b !important;
              font-weight: bold;
            }
          `}} />
        </div>

        {/* Right Col: Events List */}
        <div className="lg:col-span-8 space-y-[6px]">
          <div className="bg-surface border border-border rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Быстрые фильтры дат">
              {DATE_PRESETS.map(preset => {
                const active = datePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setDatePreset(preset.id)}
                    aria-pressed={active}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                      active
                        ? 'bg-accent text-slate-950 border-accent'
                        : 'bg-slate-900/70 text-slate-300 border-border hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Поиск по названию, организатору или каналу..."
                  aria-label="Поиск событий"
                  className="w-full rounded-xl border border-border bg-slate-950/70 pl-9 pr-8 py-2 text-xs text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Очистить поиск"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-slate-950/70 text-xs font-medium text-slate-300 cursor-pointer select-none hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={freeOnly}
                  onChange={e => setFreeOnly(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 text-accent focus:ring-accent"
                />
                Только бесплатные
              </label>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <p className="text-sm">Загрузка событий...</p>
            </div>
          ) : loadError && events.length === 0 ? (
            <div
              role="alert"
              className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-8 text-center space-y-3"
            >
              <div className="w-12 h-12 rounded-full bg-rose-500/15 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-rose-400" />
              </div>
              <h3 className="text-base font-bold text-white">{loadError}</h3>
              <p className="text-xs text-slate-300 max-w-sm mx-auto">
                Проверьте соединение с сервером и попробуйте загрузить афишу повторно.
              </p>
              <button
                type="button"
                onClick={() => void fetchEvents()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white border border-rose-500/30 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Повторить загрузку
              </button>
            </div>
          ) : selectedEvents.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-10 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-slate-500" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">Событий не найдено</h3>
              <p className="text-sm text-slate-400 max-w-sm mx-auto">
                На эту дату нет анонсов. Попробуйте выбрать другой день или нажмите «Сканировать события».
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[6px]">
              {selectedEvents.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  onDismiss={handleDismiss}
                  dismissDisabled={dismissingId !== null}
                  dismissing={dismissingId === event.id}
                />
              ))}
            </div>
          )}
        </div>
        </div>
      </main>
    </div>
  );
}
