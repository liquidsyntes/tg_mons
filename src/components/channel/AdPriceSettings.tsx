'use client';

/**
 * Блок настройки цены рекламного поста для канала.
 * Позволяет автору канала или администратору задать фиксированную стоимость
 * поста или собственный CPM (цену за 1000 просмотров), либо сбросить
 * расчет к автоматической оценке по медиане ниши.
 */

import { useEffect, useState } from 'react';
import type { AdPriceResult, AdPriceSource } from '@/lib/types';

/** Настройки цены с флагом права на редактирование */
interface PriceSettings extends AdPriceResult {
  canEdit: boolean;
}

/** Названия источников стоимости рекламы для пользователя */
const SOURCE_LABELS: Record<AdPriceSource, string> = {
  custom_price: 'Указанная цена поста',
  custom_cpm: 'Ваш CPM',
  niche_estimate: 'Оценка по нише',
};

export function AdPriceSettings({ channelId, onSaved }: { channelId: number; onSaved: () => void }) {
  const [settings, setSettings] = useState<PriceSettings | null>(null);
  const [fixedPrice, setFixedPrice] = useState('');
  const [customCpm, setCustomCpm] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Загрузка текущих цен и параметров канала с API
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/channels/${channelId}/ad-price`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить цену рекламы');
        return await response.json() as PriceSettings;
      })
      .then(data => {
        if (controller.signal.aborted) return;
        setSettings(data);
        setFixedPrice(data.customAdPriceUah?.toString() ?? '');
        setCustomCpm(data.customCpmUah?.toString() ?? '');
        setError(null);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Ошибка загрузки'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [channelId]);

  // Валидация числового ввода (целое неотрицательное число в границах Int32)
  function parseInput(value: string): number | null | undefined {
    if (value.trim() === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= 2_147_483_647 ? number : undefined;
  }

  // Сохранение новой цены или сброс к нишевым значениям через PATCH /api/channels/[id]/ad-price
  async function save(price: number | null, cpm: number | null) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/channels/${channelId}/ad-price`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customAdPriceUah: price, customCpmUah: cpm }),
      });
      if (!response.ok) throw new Error('Не удалось сохранить цену рекламы');
      const updated = await response.json() as Pick<PriceSettings, 'customAdPriceUah' | 'customCpmUah' | 'priceSource'>;
      setSettings(current => current ? { ...current, ...updated } : null);
      setFixedPrice(updated.customAdPriceUah?.toString() ?? '');
      setCustomCpm(updated.customCpmUah?.toString() ?? '');
      setExpanded(false);
      setMessage('Цена рекламы сохранена');
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-slate-900/40 p-4 space-y-3">
      {/* Краткая строка со статусом цены и кнопкой раскрытия формы */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">Цена рекламного поста</p>
          <p className="text-xs text-slate-400">{loading ? 'Загрузка...' : settings ? SOURCE_LABELS[settings.priceSource] : 'н/д'}</p>
        </div>
        {settings?.canEdit && (
          <button
            type="button"
            onClick={() => setExpanded(value => !value)}
            aria-expanded={expanded}
            className="rounded-xl border border-border px-3 py-1.5 text-xs text-white hover:bg-slate-800"
          >
            {expanded ? 'Скрыть настройки' : 'Указать цену поста / CPM'}
          </button>
        )}
      </div>

      {/* Форма редактирования цены: цена за пост или CPM */}
      {expanded && settings?.canEdit && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Фиксированная цена имеет приоритет над CPM. Пустые поля используют оценку по нише.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-300">
              Цена одного поста, ₴
              <input
                type="number"
                min="0"
                step="1"
                value={fixedPrice}
                onChange={event => setFixedPrice(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-border bg-slate-900 px-3 py-2 text-white"
              />
            </label>
            <label className="text-xs text-slate-300">
              CPM, ₴ за 1000 просмотров
              <input
                type="number"
                min="0"
                step="1"
                value={customCpm}
                onChange={event => setCustomCpm(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-border bg-slate-900 px-3 py-2 text-white"
              />
            </label>
          </div>

          {/* Кнопки сохранения и сброса к автоматической оценке */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                const price = parseInput(fixedPrice);
                const cpm = parseInput(customCpm);
                if (price === undefined || cpm === undefined) {
                  setError('Введите целые неотрицательные числа');
                  return;
                }
                void save(price, cpm);
              }}
              className="rounded-xl border border-accent px-3 py-1.5 text-xs text-accent disabled:opacity-50"
            >
              Сохранить
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(null, null)}
              className="rounded-xl border border-border px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
            >
              Сбросить к оценке по нише
            </button>
          </div>
        </div>
      )}

      {/* Уведомления об ошибке или успешном сохранении */}
      {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
      {message && <p role="status" className="text-xs text-emerald-400">{message}</p>}
    </div>
  );
}
