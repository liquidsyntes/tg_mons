'use client';

import React, { useState, useEffect } from 'react';
import { Bookmark, StickyNote, X, Check } from 'lucide-react';

interface PostBookmarkButtonProps {
  postId: number;
  isSaved?: boolean;
  savedNote?: string | null;
  onSavedChange?: (postId: number, isSaved: boolean, savedNote: string | null) => void;
}

export function PostBookmarkButton({
  postId,
  isSaved = false,
  savedNote = null,
  onSavedChange,
}: PostBookmarkButtonProps) {
  const [saved, setSaved] = useState(Boolean(isSaved));
  const [note, setNote] = useState<string | null>(savedNote ?? null);
  const [editingNote, setEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState(savedNote ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSaved(Boolean(isSaved));
    setNote(savedNote ?? null);
    setDraftNote(savedNote ?? '');
  }, [isSaved, savedNote]);

  const handleToggleBookmark = async () => {
    setSaving(true);
    setError(null);
    const prevSaved = saved;
    const prevNote = note;

    if (saved) {
      setSaved(false);
      setNote(null);
      setEditingNote(false);
      onSavedChange?.(postId, false, null);
      try {
        const res = await fetch(`/api/posts/saved?postId=${postId}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || 'Не удалось удалить из закладок');
        }
      } catch (err) {
        setSaved(prevSaved);
        setNote(prevNote);
        onSavedChange?.(postId, prevSaved, prevNote);
        setError(err instanceof Error ? err.message : 'Ошибка');
      } finally {
        setSaving(false);
      }
    } else {
      setSaved(true);
      onSavedChange?.(postId, true, note);
      try {
        const res = await fetch('/api/posts/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId, note }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || 'Не удалось сохранить в закладки');
        }
        const data = await res.json().catch(() => null);
        const serverNote = data?.savedPost?.note ?? note ?? null;
        setNote(serverNote);
        onSavedChange?.(postId, true, serverNote);
      } catch (err) {
        setSaved(prevSaved);
        onSavedChange?.(postId, prevSaved, prevNote);
        setError(err instanceof Error ? err.message : 'Ошибка');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftNote.trim();
    if (trimmed.length > 500) {
      setError('Заметка не должна превышать 500 символов');
      return;
    }

    setSaving(true);
    setError(null);
    const prevSaved = saved;
    const prevNote = note;
    const nextNote = trimmed.length > 0 ? trimmed : null;

    setSaved(true);
    setNote(nextNote);
    onSavedChange?.(postId, true, nextNote);

    try {
      const res = await fetch('/api/posts/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, note: nextNote }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Не удалось сохранить заметку');
      }
      setEditingNote(false);
    } catch (err) {
      setSaved(prevSaved);
      setNote(prevNote);
      onSavedChange?.(postId, prevSaved, prevNote);
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleToggleBookmark()}
          aria-pressed={saved}
          title={saved ? 'Удалить из закладок' : 'Сохранить пост в закладки'}
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
            saved
              ? 'border-amber-400/60 bg-amber-400/15 text-amber-300'
              : 'border-border bg-slate-900/80 text-slate-300 hover:text-white hover:border-slate-600'
          }`}
        >
          <Bookmark className={`w-3.5 h-3.5 ${saved ? 'fill-amber-400 text-amber-400' : ''}`} />
          <span>{saved ? 'В закладках' : 'В закладки'}</span>
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setDraftNote(note ?? '');
            setEditingNote((prev) => !prev);
            setError(null);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-slate-900/80 px-2 py-1 text-xs text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
        >
          <StickyNote className="w-3.5 h-3.5 text-accent" />
          <span>{note ? 'Изменить заметку' : 'Заметка'}</span>
        </button>
      </div>

      {note && !editingNote && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200 break-words">
          <span className="font-semibold text-amber-300">Заметка: </span>
          {note}
        </div>
      )}

      {editingNote && (
        <form onSubmit={(e) => void handleSaveNote(e)} className="space-y-1.5 rounded-xl border border-border bg-slate-950/90 p-2.5">
          <textarea
            rows={2}
            maxLength={500}
            value={draftNote}
            onChange={(e) => {
              setDraftNote(e.target.value);
              setError(null);
            }}
            placeholder="Добавьте рабочую заметку к посту (до 500 символов)..."
            className="w-full rounded-lg border border-border bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono text-slate-500">
              {draftNote.trim().length}/500
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEditingNote(false)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
                Отмена
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-slate-950 hover:opacity-90 disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                Сохранить
              </button>
            </div>
          </div>
        </form>
      )}

      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
