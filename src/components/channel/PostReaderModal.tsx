'use client';

import React, { useEffect } from 'react';
import { Eye, ExternalLink, X } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

export function splitHighlightedText(text: string, query: string): HighlightSegment[] {
  if (!text) return [];
  const trimmed = query.trim();
  if (!trimmed) {
    return [{ text, matched: false }];
  }

  const escaped = escapeRegExp(trimmed);
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  const lowerTrimmed = trimmed.toLowerCase();

  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      matched: part.toLowerCase() === lowerTrimmed,
    }));
}

export function highlightSearchText(text: string, highlight: string): React.ReactNode {
  if (!text) return '';
  const trimmed = highlight.trim();
  if (!trimmed) return text;

  const segments = splitHighlightedText(text, trimmed);
  return (
    <>
      {segments.map((segment, index) =>
        segment.matched ? (
          <mark key={index} className="bg-accent/40 text-white rounded px-0.5">
            {segment.text}
          </mark>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        )
      )}
    </>
  );
}

export function buildTelegramPostUrl(params: {
  channelUsername?: string | null;
  channelTgId?: string | null;
  messageId?: string | null;
}): string | null {
  const { channelUsername, channelTgId, messageId } = params;
  if (!messageId) return null;
  if (channelUsername) {
    return `https://t.me/${channelUsername}/${messageId}`;
  }
  if (channelTgId) {
    return `https://t.me/c/${channelTgId}/${messageId}`;
  }
  return null;
}

export interface PostReaderModalProps {
  publishedAt: string;
  text: string | null;
  onClose: () => void;
  channelTitle?: string | null;
  views?: number | null;
  highlightQuery?: string;
  telegramUrl?: string | null;
  emptyTextMessage?: string;
}

export function PostReaderModal({
  publishedAt,
  text,
  onClose,
  channelTitle,
  views,
  highlightQuery = '',
  telegramUrl,
  emptyTextMessage = 'Текст публикации не получен. Это может быть медиа без подписи или неподдерживаемый формат Telegram.',
}: PostReaderModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const formattedDate = new Date(publishedAt).toLocaleString('ru-RU');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Текст публикации"
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span className={channelTitle ? 'font-semibold text-white' : undefined}>
              {channelTitle ? `${channelTitle} · ${formattedDate}` : formattedDate}
            </span>
            {views !== undefined && views !== null && (
              <span className="flex items-center gap-1.5 font-mono text-emerald-400">
                <Eye className="w-4 h-4" />
                {formatNumber(views)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar text-slate-200 leading-relaxed whitespace-pre-wrap text-sm sm:text-base">
          {text ? (
            highlightSearchText(text, highlightQuery)
          ) : (
            <span className="italic text-slate-500">{emptyTextMessage}</span>
          )}
        </div>

        {telegramUrl && (
          <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent hover:bg-accent hover:text-slate-900 transition-colors rounded-xl text-sm font-semibold"
            >
              Открыть в Telegram
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
