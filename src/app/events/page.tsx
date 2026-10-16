'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Calendar as CalendarIcon, Loader2, ScanSearch, Search } from 'lucide-react';
import { isSameMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { EventCard, type EventCardData } from '@/components/events/EventCard';
import { Header } from '@/components/Header';

export default function EventsPage() {
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  
  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error(err);
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
    try {
      const res = await fetch('/api/events/scan', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const screeningNote = data.selectionMode === 'keyword_fallback'
          ? '\nJev недоступен: использован прежний отбор по ключевым словам.'
          : '';
        alert(`Сканирование завершено. Найдено новых событий: ${data.savedCount}${screeningNote}`);
        fetchEvents();
      } else {
        alert(`Ошибка: ${data.error || data.message}`);
      }
    } catch (err: any) {
      alert(`Ошибка: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  const handleDismiss = async (eventId: number) => {
    if (!confirm('Убрать событие из афиши? Оно останется скрытым после повторного сканирования.')) return;
    setDismissingId(eventId);
    try {
      const response = await fetch(`/api/events/${eventId}/dismiss`, { method: 'PATCH' });
      if (!response.ok) throw new Error('Не удалось убрать событие из афиши');
      setEvents(current => current.filter(event => event.id !== eventId));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Не удалось убрать событие из афиши');
    } finally {
      setDismissingId(null);
    }
  };

  // Extract dates with events for calendar highlighting
  const eventDates = useMemo(() => {
    return events.map(e => new Date(e.date));
  }, [events]);

  // Filter events by current month
  const selectedEvents = useMemo(() => {
    return events.filter(e => isSameMonth(new Date(e.date), currentMonth));
  }, [events, currentMonth]);

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      <Header />
      <main className="flex-1 site-shell w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
              <CalendarIcon className="w-6 h-6 shrink-0 text-accent" />
              Календарь событий
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Анонсы мероприятий, автоматически найденные в постах каналов.
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border pt-4 sm:justify-end sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <span className="text-sm font-semibold leading-tight text-slate-400 sm:max-w-[8rem] sm:text-right">
              Событий обнаружено
            </span>
            <strong className="text-3xl font-black leading-none tabular-nums text-accent" aria-live="polite">
              {loading ? '...' : selectedEvents.length}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Col: Calendar */}
        <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
          <div className="bg-surface border border-border rounded-2xl p-4 md:p-6 shadow-sm">
            <div className="calendar-wrapper flex justify-center custom-calendar text-slate-200">
              <DayPicker
                month={currentMonth}
                onMonthChange={setCurrentMonth}
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

          <button
            onClick={handleScan}
            disabled={scanning}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-accent hover:bg-accent-hover text-slate-950 font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            {scanning ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Сканирование...</>
            ) : (
              <><ScanSearch className="w-4 h-4" /> Сканировать события</>
            )}
          </button>
          
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
        <div className="lg:col-span-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <p className="text-sm">Загрузка событий...</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
