import React from 'react';
import Image from 'next/image';
import { CalendarPlus, Clock, Download, ExternalLink, Image as ImageIcon, Loader2, Tag, Trash2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { buildEventIcs, buildGoogleCalendarUrl, getTelegramPostUrl } from '@/lib/events/calendar';

interface EventPost {
  messageId: string;
  channel: {
    title: string;
    username: string | null;
    tgId: string | null;
  } | null;
}

interface EventMention {
  id: number;
  post: EventPost | null;
}

export interface EventCardData {
  id: number;
  title: string;
  date: string;
  timeStr?: string | null;
  organizer?: string | null;
  prices?: string[] | null;
  imageUrl?: string | null;
  mentions?: EventMention[];
}

interface EventCardProps {
  event: EventCardData;
  onDismiss?: (id: number) => void;
  dismissDisabled?: boolean;
  dismissing?: boolean;
}

export function EventCard({ event, onDismiss, dismissDisabled = false, dismissing = false }: EventCardProps) {
  const handleDownloadIcs = () => {
    const icsContent = buildEventIcs(event);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `event-${event.id}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const googleCalendarUrl = buildGoogleCalendarUrl(event);
  const handleOpenGoogleCalendar = () => {
    window.open(googleCalendarUrl, '_blank', 'noopener,noreferrer');
  };
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden hover:border-slate-600 transition-colors flex flex-col h-full shadow-sm">
      <div className="h-40 bg-slate-900/50 flex flex-col items-center justify-center text-slate-500 border-b border-border relative overflow-hidden">
        {event.imageUrl ? (
          <Image src={event.imageUrl} alt={`Изображение к событию «${event.title}»`} width={640} height={320} unoptimized className="h-full w-full object-cover" />
        ) : (
          <>
            <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
            <span className="text-xs font-medium">Изображение отсутствует</span>
          </>
        )}
        <div className="absolute top-3 right-3 px-2 py-1 bg-slate-900/80 backdrop-blur border border-border rounded-md text-[10px] font-bold text-accent uppercase tracking-wider">
          {format(new Date(event.date), 'dd MMM', { locale: ru })}
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="text-base font-bold text-white line-clamp-2 leading-tight">
            {event.title}
          </h3>
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(event.id)}
              disabled={dismissDisabled}
              aria-label={`Убрать событие «${event.title}» из афиши`}
              title="Убрать из афиши"
              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-slate-400 hover:border-rose-500/40 hover:text-rose-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {dismissing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Убрать
            </button>
          )}
        </div>

        <div className="space-y-2 text-sm text-slate-300 flex-1">
          {event.timeStr && (
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>{event.timeStr}</span>
            </div>
          )}

          {event.organizer && (
            <div className="flex items-start gap-2.5">
              <Users className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span className="line-clamp-1">{event.organizer}</span>
            </div>
          )}

          {event.prices && event.prices.length > 0 && (
            <div className="flex items-start gap-2.5">
              <Tag className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                {event.prices.map((price: string, i: number) => (
                  <div key={i} className="text-xs bg-slate-800/60 px-2 py-1 rounded text-slate-300 border border-slate-700/50">
                    {price}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {event.mentions && event.mentions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <div className="text-[10px] text-slate-500 font-medium mb-2 uppercase tracking-wider">
              Упоминания ({event.mentions.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {event.mentions.map(mention => {
                const channelTitle = mention.post?.channel?.title || 'Канал';
                const url = getTelegramPostUrl(mention.post);
                const badgeClass = 'text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50 truncate max-w-[120px]';

                return url ? (
                  <a
                    key={mention.id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Открыть пост ${mention.post?.messageId} канала ${channelTitle} в Telegram`}
                    className={`${badgeClass} hover:text-accent hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
                  >
                    {channelTitle}
                  </a>
                ) : (
                  <span key={mention.id} title="Ссылка на сообщение недоступна" className={badgeClass}>
                    {channelTitle}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-border/60 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadIcs}
            aria-label={`Скачать .ics для события «${event.title}»`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-slate-900/70 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-accent/50 hover:text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-accent" />
            Скачать .ics
          </button>
          <button
            type="button"
            onClick={handleOpenGoogleCalendar}
            aria-label={`Добавить событие «${event.title}» в Google Календарь`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-slate-900/70 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-accent/50 hover:text-white transition-colors"
          >
            <CalendarPlus className="w-3.5 h-3.5 text-emerald-400" />
            В Google Календарь
            <ExternalLink className="w-3 h-3 opacity-60" />
          </button>
        </div>
      </div>
    </div>
  );
}
