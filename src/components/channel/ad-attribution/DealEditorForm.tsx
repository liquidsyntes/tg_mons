'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type {
  AdPlacementDeal,
  AdPlacementFormat,
  AdPlacementStatus,
} from '@/lib/types';
import {
  FORMAT_LABELS,
  STATUS_LABELS,
  toDatetimeLocalValue,
} from './helpers';

interface DealFormPayload {
  id?: number;
  targetChannelId: number;
  donorChannelId: number;
  postId: number | null;
  priceAmount: number;
  currency: string;
  format: AdPlacementFormat;
  status: AdPlacementStatus;
  scheduledAt: string | null;
  inviteLink: string | null;
  actualJoins: number | null;
  notes: string | null;
}

interface DealEditorProps {
  channelId: number;
  donorOptions: Array<{ id: number; title: string; username: string | null }>;
  allowDonorPick: boolean;
  initialDeal: AdPlacementDeal | null;
  defaultTargetChannelId: number;
  defaultDonorChannelId: number | null;
  defaultPostId: number | null;
  defaultPrice: number | null;
  defaultScheduledAt: string | null;
  defaultStatus: AdPlacementStatus;
  onCancel: () => void;
  onSaved: () => void;
}

export function DealEditorForm({
  channelId,
  donorOptions,
  allowDonorPick,
  initialDeal,
  defaultTargetChannelId,
  defaultDonorChannelId,
  defaultPostId,
  defaultPrice,
  defaultScheduledAt,
  defaultStatus,
  onCancel,
  onSaved,
}: DealEditorProps) {
  const [donorId, setDonorId] = useState<string>(
    initialDeal?.donorChannelId?.toString()
      ?? defaultDonorChannelId?.toString()
      ?? donorOptions[0]?.id?.toString()
      ?? '',
  );
  const [price, setPrice] = useState<string>(
    initialDeal ? String(initialDeal.priceAmount) : (defaultPrice !== null ? String(Math.round(defaultPrice)) : ''),
  );
  const [format, setFormat] = useState<AdPlacementFormat>(initialDeal?.format ?? '1/24');
  const [status, setStatus] = useState<AdPlacementStatus>(initialDeal?.status ?? defaultStatus);
  const [scheduledAt, setScheduledAt] = useState<string>(
    toDatetimeLocalValue(initialDeal?.scheduledAt ?? defaultScheduledAt),
  );
  const [inviteLink, setInviteLink] = useState<string>(initialDeal?.inviteLink ?? '');
  const [actualJoins, setActualJoins] = useState<string>(
    initialDeal?.actualJoins !== null && initialDeal?.actualJoins !== undefined ? String(initialDeal.actualJoins) : '',
  );
  const [notes, setNotes] = useState<string>(initialDeal?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsedDonor = Number(donorId);
    if (!Number.isInteger(parsedDonor) || parsedDonor <= 0) {
      setFormError('Выберите канал-донор');
      return;
    }

    const parsedPrice = Number(price);
    if (price.trim() === '' || !Number.isInteger(parsedPrice) || parsedPrice < 0) {
      setFormError('Укажите цену целым неотрицательным числом');
      return;
    }

    let parsedJoins: number | null = null;
    if (actualJoins.trim() !== '') {
      const n = Number(actualJoins);
      if (!Number.isInteger(n) || n < 0) {
        setFormError('Фактические вступления должны быть целым неотрицательным числом');
        return;
      }
      parsedJoins = n;
    }

    const payload: DealFormPayload = {
      ...(initialDeal ? { id: initialDeal.id } : {}),
      targetChannelId: initialDeal?.targetChannelId ?? defaultTargetChannelId,
      donorChannelId: parsedDonor,
      postId: initialDeal ? initialDeal.postId : defaultPostId,
      priceAmount: parsedPrice,
      currency: initialDeal?.currency ?? 'UAH',
      format,
      status,
      scheduledAt: scheduledAt.trim() ? new Date(scheduledAt).toISOString() : null,
      inviteLink: inviteLink.trim() || null,
      actualJoins: parsedJoins,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      const response = await fetch(`/api/channels/${channelId}/ad-placements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(errBody?.error || 'Не удалось сохранить условия закупки');
      }
      onSaved();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Ошибка сохранения');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!initialDeal) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/channels/${channelId}/ad-placements?id=${initialDeal.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(errBody?.error || 'Не удалось удалить запись о закупке');
      }
      onSaved();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Ошибка удаления');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Форма условий рекламной закупки"
      className="mt-3 space-y-3 rounded-xl border border-border bg-slate-950/70 p-3"
    >
      <div className="grid gap-2.5 sm:grid-cols-2">
        {allowDonorPick && (
          <label className="text-xs text-slate-300 sm:col-span-2">
            Канал размещения (донор)
            <select
              value={donorId}
              onChange={event => setDonorId(event.target.value)}
              className="mt-1 block w-full rounded-xl border border-border bg-slate-900 px-2.5 py-1.5 text-white"
            >
              {donorOptions.length === 0 ? (
                <option value="">Нет доступных каналов-доноров</option>
              ) : (
                donorOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.title}{option.username ? ` (@${option.username})` : ''}
                  </option>
                ))
              )}
            </select>
          </label>
        )}

        <label className="text-xs text-slate-300">
          Цена закупки, ₴
          <input
            type="number"
            min="0"
            step="1"
            value={price}
            onChange={event => setPrice(event.target.value)}
            placeholder="Например, 1500"
            className="mt-1 block w-full rounded-xl border border-border bg-slate-900 px-2.5 py-1.5 text-white"
          />
        </label>

        <label className="text-xs text-slate-300">
          Формат размещения
          <select
            value={format}
            onChange={event => setFormat(event.target.value as AdPlacementFormat)}
            className="mt-1 block w-full rounded-xl border border-border bg-slate-900 px-2.5 py-1.5 text-white"
          >
            {(Object.keys(FORMAT_LABELS) as AdPlacementFormat[]).map(key => (
              <option key={key} value={key}>{FORMAT_LABELS[key]}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-300">
          Статус сделки
          <select
            value={status}
            onChange={event => setStatus(event.target.value as AdPlacementStatus)}
            className="mt-1 block w-full rounded-xl border border-border bg-slate-900 px-2.5 py-1.5 text-white"
          >
            {(Object.keys(STATUS_LABELS) as AdPlacementStatus[]).map(key => (
              <option key={key} value={key}>{STATUS_LABELS[key]}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-300">
          Вступления по инвайт-ссылке
          <input
            type="number"
            min="0"
            step="1"
            value={actualJoins}
            onChange={event => setActualJoins(event.target.value)}
            placeholder="Необязательно"
            className="mt-1 block w-full rounded-xl border border-border bg-slate-900 px-2.5 py-1.5 text-white"
          />
        </label>

        {allowDonorPick && (
          <label className="text-xs text-slate-300">
            Дата/время выхода
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={event => setScheduledAt(event.target.value)}
              className="mt-1 block w-full rounded-xl border border-border bg-slate-900 px-2.5 py-1.5 text-white"
            />
          </label>
        )}

        <label className={`text-xs text-slate-300 ${allowDonorPick ? '' : 'sm:col-span-2'}`}>
          Инвайт-ссылка
          <input
            type="text"
            value={inviteLink}
            onChange={event => setInviteLink(event.target.value)}
            placeholder="https://t.me/+..."
            className="mt-1 block w-full rounded-xl border border-border bg-slate-900 px-2.5 py-1.5 text-white"
          />
        </label>

        <label className="text-xs text-slate-300 sm:col-span-2">
          Заметка
          <input
            type="text"
            value={notes}
            onChange={event => setNotes(event.target.value)}
            placeholder="Комментарий по креативу или договорённостям"
            className="mt-1 block w-full rounded-xl border border-border bg-slate-900 px-2.5 py-1.5 text-white"
          />
        </label>
      </div>

      {formError && <p role="alert" className="text-xs text-rose-400">{formError}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {submitting ? 'Сохранение...' : 'Сохранить условия'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="rounded-xl border border-border px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            Отмена
          </button>
        </div>

        {initialDeal && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleDelete()}
            className="inline-flex items-center gap-1 rounded-xl border border-rose-500/40 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
