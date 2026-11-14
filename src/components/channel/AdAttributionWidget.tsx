'use client';

/**
 * Виджет рекламной атрибуции и трекера закупок канала на странице /channel/[id].
 * Отображает сводку фактического ROI/CPM/CPF по закупкам, автоматически найденные
 * упоминания (+24/+48 ч прирост) и позволяет фиксировать реальные условия сделок
 * (цену, формат 1/24, 2/48, инвайт-ссылку, фактические вступления и заметки).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import type {
  AdAttributionPlacement,
  AdCampaignSummary,
  AdPlacementDeal,
  AdPlacementFormat,
  AdPlacementStatus,
  AdPriceSource,
  ChannelAdAttribution,
} from '@/lib/types';
import { isDeletedRetentionFormat } from '@/lib/adReach';
import { AdRetentionBadge } from '@/components/AdRetentionBadge';
import { AdPriceSettings } from './AdPriceSettings';

/** Направление атрибуции: inbound — закупки (входящие упоминания), outbound — отдача рекламы */
type Direction = 'inbound' | 'outbound';

const numberFormat = new Intl.NumberFormat('ru-RU');
const moneyFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

const PRICE_LABELS: Record<AdPriceSource, string> = {
  custom_price: 'Указанная цена',
  custom_cpm: 'Ваш CPM',
  niche_estimate: 'Оценка по нише',
};

const FORMAT_LABELS: Record<AdPlacementFormat, string> = {
  '1/24': '1/24 (1ч топ / 24ч лента)',
  '2/48': '2/48 (2ч топ / 48ч лента)',
  '3/72': '3/72 (3ч топ / 72ч лента)',
  native: 'Нативная интеграция',
  eternal: 'Без удаления',
};

const FORMAT_SHORT_LABELS: Record<AdPlacementFormat, string> = {
  '1/24': '1/24',
  '2/48': '2/48',
  '3/72': '3/72',
  native: 'Натив',
  eternal: 'Без удаления',
};

const STATUS_LABELS: Record<AdPlacementStatus, string> = {
  planned: 'Запланировано',
  published: 'Опубликовано',
  completed: 'Завершено',
  cancelled: 'Отменено',
};

const STATUS_BADGE_CLASSES: Record<AdPlacementStatus, string> = {
  planned: 'bg-sky-500/15 text-sky-300',
  published: 'bg-indigo-500/15 text-indigo-300',
  completed: 'bg-emerald-500/15 text-emerald-300',
  cancelled: 'bg-slate-800 text-slate-400 line-through',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  UAH: '₴',
  RUB: '₽',
  USD: '$',
  EUR: '€',
};

function formatDelta(value: number | null): string {
  return value === null ? 'н/д' : `${value > 0 ? '+' : ''}${numberFormat.format(value)}`;
}

function formatMoney(value: number | null, currency = 'UAH'): string {
  if (value === null) return 'н/д';
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency;
  return `${moneyFormat.format(value)} ${symbol}`;
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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

function DealEditorForm({
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

function SummaryKpiStrip({ summary }: { summary: AdCampaignSummary }) {
  return (
    <div
      className="grid gap-3 rounded-xl border border-border bg-slate-900/50 p-3.5 sm:grid-cols-2 lg:grid-cols-5"
      aria-label="Сводка фактических закупок"
    >
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Потрачено всего</p>
        <p className="mt-1 text-base font-semibold text-white">{formatMoney(summary.totalSpent, summary.currency)}</p>
        <p className="text-[11px] text-slate-400">
          Сделок: {summary.dealsCount}{summary.activeDealsCount > 0 ? ` (в работе: ${summary.activeDealsCount})` : ''}
        </p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Привлечено подписчиков</p>
        <p className="mt-1 text-base font-semibold text-emerald-300">
          {summary.totalGainedSubscribers > 0 ? `+${numberFormat.format(summary.totalGainedSubscribers)}` : numberFormat.format(summary.totalGainedSubscribers)}
        </p>
        <p className="text-[11px] text-slate-400">По инвайтам или оценке</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Средний CPF</p>
        <p className="mt-1 text-base font-semibold text-white">{formatMoney(summary.avgCpf, summary.currency)}</p>
        <p className="text-[11px] text-slate-400">Цена за подписчика</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Средний CPM</p>
        <p className="mt-1 text-base font-semibold text-white">{formatMoney(summary.avgCpm, summary.currency)}</p>
        <p className="text-[11px] text-slate-400">За 1000 просмотров</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Лучший донор</p>
        {summary.bestDonor ? (
          <>
            <Link
              href={`/channel/${summary.bestDonor.channelId}`}
              className="mt-1 block truncate text-sm font-semibold text-accent hover:underline"
            >
              {summary.bestDonor.title}
            </Link>
            <p className="text-[11px] text-slate-400">
              CPF: {formatMoney(summary.bestDonor.cpf, summary.currency)} (+{numberFormat.format(summary.bestDonor.gainedSubscribers)})
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-400">н/д</p>
        )}
      </div>
    </div>
  );
}

function PlacementCard({
  channelId,
  placement,
  direction,
  onSaved,
}: {
  channelId: number;
  placement: AdAttributionPlacement;
  direction: Direction;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const otherChannel = direction === 'inbound' ? placement.sourceChannel : placement.targetChannel;
  const deal = placement.deal ?? null;
  const retentionFormat = placement.retentionFormat;
  const isDeleted = Boolean(placement.deletedAt) || isDeletedRetentionFormat(retentionFormat);
  const displayedViews = placement.lastCapturedViews ?? placement.views;

  return (
    <article className="rounded-xl border border-border bg-slate-900/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/channel/${otherChannel.id}`} className="text-sm font-semibold text-white hover:text-accent">
          {otherChannel.title}{otherChannel.username ? ` (@${otherChannel.username})` : ''}
        </Link>
        <span className="text-xs text-slate-400">{new Date(placement.publishedAt).toLocaleString('ru-RU')}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-2 py-0.5 ${placement.isAd ? 'bg-orange-500/15 text-orange-300' : 'bg-slate-800 text-slate-400'}`}>
          {placement.isAd ? 'Реклама' : 'Упоминание'}
        </span>
        <AdRetentionBadge format={retentionFormat} deletedAt={placement.deletedAt} variant="detailed" />
        {placement.overlappingCampaigns && (
          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-300" title="В этот же период выходили другие размещения">
            Пересечение размещений
          </span>
        )}
        {deal && (
          <>
            <span className={`rounded px-2 py-0.5 ${STATUS_BADGE_CLASSES[deal.status]}`}>
              {STATUS_LABELS[deal.status]}
            </span>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-200">
              {FORMAT_SHORT_LABELS[deal.format]}
            </span>
            {deal.factualCpm !== null && (
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                CPM {formatMoney(deal.factualCpm, deal.currency)}
              </span>
            )}
            {deal.factualCpf !== null && (
              <span className="rounded bg-accent/15 px-2 py-0.5 text-accent">
                CPF {formatMoney(deal.factualCpf, deal.currency)}
              </span>
            )}
          </>
        )}
      </div>

      <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
        <span>
          {isDeleted ? 'Сохранённый охват' : 'Текущий охват'}:{' '}
          {displayedViews === null ? 'н/д' : numberFormat.format(displayedViews)}
        </span>
        <span>Подписчики +24 ч: {formatDelta(placement.deltaSubscribers24h)}</span>
        <span>Подписчики +48 ч: {formatDelta(placement.deltaSubscribers48h)}</span>
        {deal ? (
          <>
            <span className="font-medium text-white">
              Факт. цена: {formatMoney(deal.priceAmount, deal.currency)}
            </span>
            <span>
              Факт. CPF: {formatMoney(deal.factualCpf, deal.currency)}
              {deal.actualJoins !== null ? ` (по инвайту: +${numberFormat.format(deal.actualJoins)})` : ''}
            </span>
          </>
        ) : (
          <>
            <span>Цена поста: {formatMoney(placement.estimatedPricePerPost)}{placement.priceSource ? ` · ${PRICE_LABELS[placement.priceSource]}` : ''}</span>
            <span>Оценочный CPF: {formatMoney(placement.estimatedCpf)}</span>
          </>
        )}
        {direction === 'outbound' && (
          <span>Конверсия просмотров: {placement.conversionPercent === null ? 'н/д' : `${placement.conversionPercent}%`}</span>
        )}
      </div>

      {deal?.notes && (
        <p className="rounded-lg bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-300">
          {deal.notes}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {deal?.inviteLink ? (
          <span className="truncate text-[11px] text-slate-400" title={deal.inviteLink}>
            Инвайт: {deal.inviteLink}
          </span>
        ) : <span />}
        <button
          type="button"
          onClick={() => setEditing(value => !value)}
          className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
        >
          <Pencil className="h-3 w-3" />
          {deal ? 'Изменить условия' : 'Указать цену / условия'}
        </button>
      </div>

      {editing && (
        <DealEditorForm
          channelId={channelId}
          donorOptions={[placement.sourceChannel]}
          allowDonorPick={false}
          initialDeal={deal}
          defaultTargetChannelId={placement.targetChannel.id}
          defaultDonorChannelId={placement.sourceChannel.id}
          defaultPostId={placement.postId}
          defaultPrice={placement.estimatedPricePerPost}
          defaultScheduledAt={placement.publishedAt}
          defaultStatus="completed"
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      )}
    </article>
  );
}

function ManualDealCard({
  channelId,
  deal,
  donorOptions,
  onSaved,
}: {
  channelId: number;
  deal: AdPlacementDeal;
  donorOptions: Array<{ id: number; title: string; username: string | null }>;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <article className="rounded-xl border border-border bg-slate-900/40 p-4 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {deal.donorChannel ? (
          <Link href={`/channel/${deal.donorChannel.id}`} className="text-sm font-semibold text-white hover:text-accent">
            {deal.donorChannel.title}{deal.donorChannel.username ? ` (@${deal.donorChannel.username})` : ''}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-white">Канал #{deal.donorChannelId}</span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
          <Calendar className="h-3.5 w-3.5" />
          {deal.scheduledAt ? new Date(deal.scheduledAt).toLocaleString('ru-RU') : 'Дата не указана'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`rounded px-2 py-0.5 ${STATUS_BADGE_CLASSES[deal.status]}`}>
          {STATUS_LABELS[deal.status]}
        </span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-200">
          {FORMAT_SHORT_LABELS[deal.format]}
        </span>
        {deal.factualCpm !== null && (
          <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
            CPM {formatMoney(deal.factualCpm, deal.currency)}
          </span>
        )}
        {deal.factualCpf !== null && (
          <span className="rounded bg-accent/15 px-2 py-0.5 text-accent">
            CPF {formatMoney(deal.factualCpf, deal.currency)}
          </span>
        )}
      </div>

      <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
        <span className="font-medium text-white">Цена: {formatMoney(deal.priceAmount, deal.currency)}</span>
        <span>
          Прирост: {formatDelta(deal.effectiveGain)}
          {deal.actualJoins !== null ? ' (инвайт)' : ''}
        </span>
        <span>CPF: {formatMoney(deal.factualCpf, deal.currency)}</span>
      </div>

      {deal.notes && (
        <p className="rounded-lg bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-300">{deal.notes}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {deal.inviteLink ? (
          <span className="truncate text-[11px] text-slate-400" title={deal.inviteLink}>
            Инвайт: {deal.inviteLink}
          </span>
        ) : <span />}
        <button
          type="button"
          onClick={() => setEditing(value => !value)}
          className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
        >
          <Pencil className="h-3 w-3" />
          Редактировать
        </button>
      </div>

      {editing && (
        <DealEditorForm
          channelId={channelId}
          donorOptions={donorOptions.length > 0 ? donorOptions : (deal.donorChannel ? [deal.donorChannel] : [])}
          allowDonorPick={donorOptions.length > 0}
          initialDeal={deal}
          defaultTargetChannelId={deal.targetChannelId}
          defaultDonorChannelId={deal.donorChannelId}
          defaultPostId={deal.postId}
          defaultPrice={deal.priceAmount}
          defaultScheduledAt={deal.scheduledAt}
          defaultStatus={deal.status}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      )}
    </article>
  );
}

/**
 * Основной компонент виджета атрибуции и трекера закупок.
 */
export function AdAttributionWidget({ channelId, onPriceSaved }: { channelId: number; onPriceSaved?: () => void }) {
  const [direction, setDirection] = useState<Direction>('inbound');
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<ChannelAdAttribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceRevision, setPriceRevision] = useState(0);
  const [showNewDealForm, setShowNewDealForm] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/channels/${channelId}/ad-attribution?days=${days}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить эффективность размещений');
        return await response.json() as ChannelAdAttribution;
      })
      .then(setData)
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Ошибка загрузки');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [channelId, days, priceRevision]);

  const placements = data?.[direction] ?? [];
  const manualPlacements = data?.manualPlacements ?? [];
  const accessibleChannels = data?.accessibleChannels ?? [];
  const summary = data?.summary;
  const triggerReload = () => {
    setPriceRevision(value => value + 1);
    onPriceSaved?.();
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Megaphone className="h-4 w-4 text-accent" />
            Эффективность размещений
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Фактический учёт закупок (CPM, CPF) и автоматическая атрибуция прироста аудитории.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewDealForm(value => !value)}
            disabled={accessibleChannels.length === 0}
            title={accessibleChannels.length === 0 ? 'Добавьте ещё один канал, чтобы выбрать донора' : undefined}
            className="inline-flex items-center gap-1 rounded-xl border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            {showNewDealForm ? 'Скрыть форму' : 'Добавить закупку'}
          </button>
          <label className="text-xs text-slate-300">
            Период{' '}
            <select
              value={days}
              onChange={event => setDays(Number(event.target.value) as 7 | 30 | 90)}
              className="rounded-xl border border-border bg-slate-900 px-2 py-1.5 text-white"
            >
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
            </select>
          </label>
        </div>
      </div>

      {summary && summary.dealsCount > 0 && (
        <SummaryKpiStrip summary={summary} />
      )}

      {showNewDealForm && (
        <DealEditorForm
          channelId={channelId}
          donorOptions={accessibleChannels}
          allowDonorPick={true}
          initialDeal={null}
          defaultTargetChannelId={channelId}
          defaultDonorChannelId={accessibleChannels[0]?.id ?? null}
          defaultPostId={null}
          defaultPrice={null}
          defaultScheduledAt={null}
          defaultStatus="planned"
          onCancel={() => setShowNewDealForm(false)}
          onSaved={() => {
            setShowNewDealForm(false);
            triggerReload();
          }}
        />
      )}

      <AdPriceSettings
        channelId={channelId}
        onSaved={triggerReload}
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Направление размещений">
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'inbound'}
          onClick={() => setDirection('inbound')}
          className={`rounded-xl border px-3 py-2 text-xs ${direction === 'inbound' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'}`}
        >
          Закупки (Входящие упоминания)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'outbound'}
          onClick={() => setDirection('outbound')}
          className={`rounded-xl border px-3 py-2 text-xs ${direction === 'outbound' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'}`}
        >
          Отдача рекламы (Исходящие размещения)
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}

      {loading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-900/50" aria-label="Загрузка размещений" />
      ) : (
        <>
          {direction === 'inbound' && manualPlacements.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Запланированные и ручные закупки ({manualPlacements.length})
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {manualPlacements.map(deal => (
                  <ManualDealCard
                    key={`deal-${deal.id}`}
                    channelId={channelId}
                    deal={deal}
                    donorOptions={accessibleChannels}
                    onSaved={triggerReload}
                  />
                ))}
              </div>
            </div>
          )}

          {placements.length === 0 && (direction === 'outbound' || manualPlacements.length === 0) ? (
            <p className="rounded-xl border border-border p-6 text-center text-sm text-slate-400">
              Размещений за выбранный период нет.
            </p>
          ) : placements.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-2">
              {placements.map(placement => (
                <PlacementCard
                  key={`${placement.postId}:${placement.targetChannel.id}`}
                  channelId={channelId}
                  placement={placement}
                  direction={direction}
                  onSaved={triggerReload}
                />
              ))}
            </div>
          )}
        </>
      )}

      <p className="text-xs text-slate-500">
        Прирост без указания инвайт-ссылки может включать органические подписки. Зафиксированная цена и вступления используются в фактических расчётах CPM и CPF.
      </p>
    </section>
  );
}
