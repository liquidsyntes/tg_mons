import React from 'react';
import { Calendar, Clock, MapPin, Tag, Users, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface EventCardProps {
  event: any; // Using any for simplicity here, can type it properly later
}

export function EventCard({ event }: EventCardProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden hover:border-slate-600 transition-colors flex flex-col h-full shadow-sm">
      {/* Poster Placeholder */}
      <div className="h-40 bg-slate-900/50 flex flex-col items-center justify-center text-slate-500 border-b border-border relative">
        <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
        <span className="text-xs font-medium">Афиша (скоро)</span>
        <div className="absolute top-3 right-3 px-2 py-1 bg-slate-900/80 backdrop-blur border border-border rounded-md text-[10px] font-bold text-accent uppercase tracking-wider">
          {format(new Date(event.date), 'dd MMM', { locale: ru })}
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-base font-bold text-white mb-3 line-clamp-2 leading-tight">
          {event.title}
        </h3>

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
              {event.mentions.map((m: any) => (
                <span key={m.id} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50 truncate max-w-[120px]">
                  {m.post?.channel?.title || 'Канал'}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
