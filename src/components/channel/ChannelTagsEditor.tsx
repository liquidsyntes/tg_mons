'use client';

import React, { useState, useEffect } from 'react';
import { Tag, Plus, X } from 'lucide-react';
import {
  normalizeChannelTags,
  MAX_CHANNEL_TAGS,
  MAX_CHANNEL_TAG_LENGTH,
} from '@/lib/tags';

interface ChannelTagsEditorProps {
  channelId: number;
  tags?: string[];
  availableTags?: string[];
  compact?: boolean;
  onTagsChange?: (channelId: number, nextTags: string[]) => void;
}

export function ChannelTagsEditor({
  channelId,
  tags = [],
  availableTags = [],
  compact = false,
  onTagsChange,
}: ChannelTagsEditorProps) {
  const [currentTags, setCurrentTags] = useState<string[]>(tags);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentTags(tags);
  }, [tags]);

  const saveTags = async (nextTags: string[]) => {
    const previousTags = currentTags;
    setCurrentTags(nextTags);
    onTagsChange?.(channelId, nextTags);
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: nextTags }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Не удалось сохранить теги');
      }
      const updated = await res.json().catch(() => null);
      if (updated && Array.isArray(updated.tags)) {
        setCurrentTags(updated.tags);
        onTagsChange?.(channelId, updated.tags);
      }
    } catch (err) {
      setCurrentTags(previousTags);
      onTagsChange?.(channelId, previousTags);
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTag = async (rawTag: string) => {
    const trimmed = rawTag.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_CHANNEL_TAG_LENGTH) {
      setError(`Максимум ${MAX_CHANNEL_TAG_LENGTH} символов`);
      return;
    }
    const candidate = normalizeChannelTags([...currentTags, trimmed]);
    if (!candidate) {
      setError(`Не более ${MAX_CHANNEL_TAGS} тегов на канал`);
      return;
    }
    setInputValue('');
    if (candidate.length === currentTags.length) {
      return;
    }
    await saveTags(candidate);
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const nextTags = currentTags.filter(
      (t) => t.toLowerCase() !== tagToRemove.toLowerCase()
    );
    await saveTags(nextTags);
  };

  const suggestions = availableTags.filter(
    (suggestion) =>
      !currentTags.some((t) => t.toLowerCase() === suggestion.toLowerCase()) &&
      (!inputValue.trim() ||
        suggestion.toLowerCase().includes(inputValue.trim().toLowerCase()))
  );

  const visibleTags = compact ? currentTags.slice(0, 2) : currentTags;
  const hiddenCount = compact ? Math.max(0, currentTags.length - visibleTags.length) : 0;
  const datalistId = `channel-tags-suggestions-${channelId}`;

  return (
    <div
      className="relative flex flex-wrap items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      {visibleTags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-slate-800/90 border border-border/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-300"
        >
          <span className="truncate max-w-[110px]" title={tag}>
            {tag}
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleRemoveTag(tag)}
            aria-label={`Удалить тег ${tag}`}
            className="text-slate-400 hover:text-rose-400 transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setIsEditing((prev) => !prev)}
          className="rounded bg-slate-800/80 border border-border/70 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 hover:text-white"
          title={currentTags.slice(2).join(', ')}
        >
          +{hiddenCount}
        </button>
      )}

      {currentTags.length < MAX_CHANNEL_TAGS && (
        <button
          type="button"
          onClick={() => {
            setIsEditing((prev) => !prev);
            setError(null);
          }}
          aria-label="Редактировать теги канала"
          title="Добавить или изменить теги"
          className="inline-flex items-center gap-0.5 rounded bg-slate-800/70 hover:bg-slate-700/80 border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 hover:text-white transition-colors"
        >
          <Plus className="w-2.5 h-2.5" />
          <span>{compact && currentTags.length > 0 ? '' : 'Тег'}</span>
        </button>
      )}

      {isEditing && (
        <div
          role="dialog"
          aria-label="Редактор тегов канала"
          className="z-30 mt-1 w-56 rounded-xl border border-border bg-slate-900 p-2.5 shadow-lg space-y-2"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
            <span className="inline-flex items-center gap-1">
              <Tag className="w-3 h-3 text-accent" />
              Теги ({currentTags.length}/{MAX_CHANNEL_TAGS})
            </span>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              aria-label="Закрыть редактор тегов"
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {compact && currentTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {currentTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded bg-slate-800 border border-border px-1.5 py-0.5 text-[10px] text-slate-200"
                >
                  <span>{tag}</span>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleRemoveTag(tag)}
                    aria-label={`Удалить тег ${tag}`}
                    className="text-slate-400 hover:text-rose-400"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {currentTags.length < MAX_CHANNEL_TAGS && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleAddTag(inputValue);
              }}
              className="flex items-center gap-1"
            >
              <input
                type="text"
                list={datalistId}
                value={inputValue}
                maxLength={MAX_CHANNEL_TAG_LENGTH}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setError(null);
                }}
                placeholder="Новый тег..."
                className="min-w-0 flex-1 rounded border border-border bg-slate-950 px-2 py-1 text-xs text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
              />
              <datalist id={datalistId}>
                {suggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <button
                type="submit"
                disabled={saving || !inputValue.trim()}
                className="rounded bg-accent px-2 py-1 text-xs font-semibold text-slate-950 hover:opacity-90 disabled:opacity-50"
              >
                +
              </button>
            </form>
          )}

          {suggestions.length > 0 && currentTags.length < MAX_CHANNEL_TAGS && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {suggestions.slice(0, 6).map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={saving}
                  onClick={() => void handleAddTag(item)}
                  className="rounded bg-slate-800/80 hover:bg-slate-800 border border-border/60 px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-accent transition-colors"
                >
                  + {item}
                </button>
              ))}
            </div>
          )}

          {error && <p className="text-[10px] text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
