'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Calendar, Check, FileText, Image as ImageIcon, Sparkles, Trash2, X } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import {
  ALL_CONTENT_PLAN_STATUSES,
  CONTENT_PLAN_STATUS_LABELS,
  formatPlannedSlotDateTime,
  groupSavedPostsByStatus,
  normalizeContentPlanStatus,
} from '@/lib/metrics/content-plan';
import type {
  ContentPlanRecommendations,
  ContentPlanStatus,
  SearchPost,
} from '@/lib/types';

export interface ContentPlanPatchPayload {
  status?: ContentPlanStatus;
  plannedFor?: string | null;
  draftText?: string | null;
  note?: string | null;
}

export interface ContentPlanBoardProps {
  posts: SearchPost[];
  recommendations: ContentPlanRecommendations | null;
  recommendationsLoading?: boolean;
  onUpdatePlan: (postId: number, patch: ContentPlanPatchPayload) => Promise<void>;
  onRemoveSaved: (postId: number) => Promise<void>;
  onOpenPost?: (post: SearchPost) => void;
}

const COLUMN_ACCENT_CLASSES: Record<ContentPlanStatus, string> = {
  idea: 'border-t-slate-400/70',
  in_progress: 'border-t-amber-400/80',
  ready: 'border-t-emerald-400/80',
  published: 'border-t-accent/80',
};

function formatPercent(value: number | null): string {
  return value === null ? 'н/д' : `${value.toFixed(1)}%`;
}

export function ContentPlanBoard({
  posts,
  recommendations,
  recommendationsLoading = false,
  onUpdatePlan,
  onRemoveSaved,
  onOpenPost,
}: ContentPlanBoardProps) {
  const [draftsByPostId, setDraftsByPostId] = useState<Record<number, string>>({});
  const [savingPostId, setSavingPostId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const prevServerDraftsRef = useRef<Record<number, string>>({});

  useEffect(() => {
    setDraftsByPostId((prev) => {
      const next: Record<number, string> = {};
      const nextServerMap: Record<number, string> = {};
      for (const post of posts) {
        const serverDraft = post.savedDraftText ?? '';
        nextServerMap[post.id] = serverDraft;
        const prevServerDraft = prevServerDraftsRef.current[post.id];
        next[post.id] =
          !(post.id in prev) || prevServerDraft !== serverDraft
            ? serverDraft
            : prev[post.id];
      }
      prevServerDraftsRef.current = nextServerMap;
      return next;
    });
  }, [posts]);

  const columns = useMemo(() => groupSavedPostsByStatus(posts), [posts]);
  const bestAvailableSlot = recommendations?.slots[0] ?? null;
  const guidance = recommendations?.formatGuidance ?? null;

  async function runPostUpdate(postId: number, patch: ContentPlanPatchPayload) {
    setSavingPostId(postId);
    setActionError(null);
    try {
      await onUpdatePlan(postId, patch);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Не удалось обновить карточку контент-плана',
      );
    } finally {
      setSavingPostId((current) => (current === postId ? null : current));
    }
  }

  async function runPostRemove(postId: number) {
    setSavingPostId(postId);
    setActionError(null);
    try {
      await onRemoveSaved(postId);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Не удалось удалить пост из закладок',
      );
    } finally {
      setSavingPostId((current) => (current === postId ? null : current));
    }
  }

  return (
    <section aria-label="Доска контент-плана" className="space-y-4">
      <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
              <Sparkles className="w-4 h-4" />
              <span>Рекомендации для контент-плана</span>
            </div>
            {recommendationsLoading ? (
              <p className="text-sm text-slate-300">Подбираю лучшие окна и формат для вашего канала...</p>
            ) : guidance ? (
              <p className="text-sm font-medium text-white">{guidance.summaryText}</p>
            ) : recommendations && recommendations.slots.length > 0 ? (
              <p className="text-sm text-slate-200">
                Лучшие окна: {recommendations.slots.slice(0, 3).map((slot) => slot.label).join(', ')}
                {' · '}
                Отметьте «Мой канал» в настройках канала для персональной рекомендации формата.
              </p>
            ) : (
              <p className="text-sm text-slate-300">
                Добавьте каналы и отметьте «Мой канал», чтобы получать персональные подсказки по времени и формату публикаций.
              </p>
            )}
          </div>

          {guidance?.bestStructureLabel && (
            <span className="rounded-lg border border-accent/40 bg-slate-900/70 px-2.5 py-1 text-xs text-slate-200">
              Лучший приём: {guidance.bestStructureLabel}
            </span>
          )}
        </div>
      </div>

      {actionError && (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {actionError}
        </p>
      )}

      {posts.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-slate-400">
          В избранном пока нет постов. Сохраните идеи из ленты поиска, чтобы вести здесь контент-план.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ALL_CONTENT_PLAN_STATUSES.map((status) => {
            const columnPosts = columns[status];
            return (
              <div
                key={status}
                className={`flex flex-col rounded-xl border border-border border-t-2 ${COLUMN_ACCENT_CLASSES[status]} bg-surface/80 p-3 space-y-3`}
                aria-label={`Колонка: ${CONTENT_PLAN_STATUS_LABELS[status]}`}
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-2">
                  <h2 className="text-sm font-semibold text-white">
                    {CONTENT_PLAN_STATUS_LABELS[status]}
                  </h2>
                  <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-300">
                    {columnPosts.length}
                  </span>
                </div>

                {columnPosts.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    Нет карточек в этом статусе
                  </p>
                ) : (
                  <div className="space-y-3">
                    {columnPosts.map((post) => {
                      const currentStatus = normalizeContentPlanStatus(post.savedStatus);
                      const charCount = (post.text ?? '').trim().length;
                      const draftValue = draftsByPostId[post.id] ?? post.savedDraftText ?? '';
                      const isDirtyDraft = draftValue.trim() !== (post.savedDraftText ?? '').trim();
                      const plannedLabel = formatPlannedSlotDateTime(post.savedPlannedFor);
                      const isBusy = savingPostId === post.id;

                      return (
                        <article
                          key={post.id}
                          className="rounded-xl border border-border bg-slate-950/80 p-3 space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Link
                                href={`/channel/${post.channel.id}`}
                                className="block truncate text-xs font-semibold text-white hover:text-accent"
                              >
                                {post.channel.title}
                              </Link>
                              <p className="text-[11px] text-slate-500">
                                {new Date(post.publishedAt).toLocaleDateString('ru-RU')}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void runPostRemove(post.id)}
                              title="Удалить из закладок"
                              aria-label="Удалить из закладок"
                              className="rounded-lg border border-border p-1 text-slate-400 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                            <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-slate-300">
                              ERR {formatPercent(post.err)}
                            </span>
                            <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-slate-300">
                              {formatNumber(charCount)} зн.
                            </span>
                            {post.hasImage && (
                              <span className="inline-flex items-center gap-1 rounded bg-slate-900 px-1.5 py-0.5 text-slate-300">
                                <ImageIcon className="w-3 h-3 text-accent" />
                                Медиа
                              </span>
                            )}
                          </div>

                          <p className="line-clamp-3 whitespace-pre-wrap text-xs text-slate-300">
                            {post.text || 'Текст публикации недоступен'}
                          </p>

                          {onOpenPost && (
                            <button
                              type="button"
                              onClick={() => onOpenPost(post)}
                              className="text-[11px] font-medium text-accent hover:underline"
                            >
                              Читать полностью
                            </button>
                          )}

                          {post.savedNote && (
                            <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200 break-words">
                              <span className="font-semibold text-amber-300">Заметка: </span>
                              {post.savedNote}
                            </div>
                          )}

                          <div className="space-y-1.5 pt-1 border-t border-border/60">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                                <FileText className="w-3 h-3 text-accent" />
                                Черновик адаптации
                              </span>
                              {isDirtyDraft && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void runPostUpdate(post.id, { draftText: draftValue })
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg bg-accent px-2 py-0.5 text-[11px] font-semibold text-slate-950 hover:opacity-90 disabled:opacity-50"
                                >
                                  <Check className="w-3 h-3" />
                                  Сохранить
                                </button>
                              )}
                            </div>
                            <textarea
                              rows={2}
                              maxLength={4000}
                              aria-label="Черновик адаптации"
                              value={draftValue}
                              onChange={(event) =>
                                setDraftsByPostId((current) => ({
                                  ...current,
                                  [post.id]: event.target.value,
                                }))
                              }
                              placeholder="Тезисы или адаптированный текст для вашего канала..."
                              className="w-full rounded-lg border border-border bg-slate-900 px-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
                            />
                          </div>

                          <div className="space-y-2 pt-1">
                            {plannedLabel ? (
                              <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                                <span className="inline-flex items-center gap-1 truncate">
                                  <Calendar className="w-3 h-3 shrink-0" />
                                  Слот: {plannedLabel}
                                </span>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void runPostUpdate(post.id, { plannedFor: null })}
                                  title="Сбросить слот"
                                  aria-label="Сбросить слот"
                                  className="text-emerald-300 hover:text-white disabled:opacity-50"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              currentStatus !== 'published' &&
                              bestAvailableSlot && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void runPostUpdate(post.id, {
                                      plannedFor: bestAvailableSlot.dateTime,
                                    })
                                  }
                                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
                                >
                                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                                  <span>Поставить в лучший слот: {bestAvailableSlot.label}</span>
                                </button>
                              )
                            )}

                            <label className="block">
                              <span className="sr-only">Статус карточки</span>
                              <select
                                aria-label="Статус карточки"
                                disabled={isBusy}
                                value={currentStatus}
                                onChange={(event) =>
                                  void runPostUpdate(post.id, {
                                    status: event.target.value as ContentPlanStatus,
                                  })
                                }
                                className="w-full rounded-lg border border-border bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:border-accent focus:outline-none disabled:opacity-50"
                              >
                                {ALL_CONTENT_PLAN_STATUSES.map((optionStatus) => (
                                  <option key={optionStatus} value={optionStatus}>
                                    {CONTENT_PLAN_STATUS_LABELS[optionStatus]}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
