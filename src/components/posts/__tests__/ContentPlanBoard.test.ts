/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContentPlanBoard } from '../ContentPlanBoard';
import type { ContentPlanRecommendations, SearchPost } from '@/lib/types';

afterEach(() => {
  cleanup();
});

function makePost(overrides: Partial<SearchPost> = {}): SearchPost {
  return {
    id: 1,
    messageId: '101',
    publishedAt: '2026-11-10T10:00:00.000Z',
    text: 'Пример поста для контент-плана с отличным вовлечением аудитории',
    isAd: false,
    views: 4200,
    reactions: 80,
    reactionBreakdown: null,
    comments: 14,
    forwards: 26,
    er: 12.5,
    err: 2.86,
    hasImage: true,
    mentions: [],
    isViral: false,
    viralReasons: [],
    viralPrimaryReason: null,
    viralMultiplier: null,
    isSaved: true,
    savedNote: 'Адаптировать под пятничный выпуск',
    savedAt: '2026-11-11T09:00:00.000Z',
    savedStatus: 'idea',
    savedPlannedFor: null,
    savedDraftText: null,
    channel: { id: 7, title: 'Tech News', username: 'tech_news', niche: 'tech' },
    ...overrides,
  };
}

const recommendations: ContentPlanRecommendations = {
  slots: [
    {
      dateTime: '2026-11-19T15:00:00.000Z',
      dateKey: '2026-11-19',
      dayOfWeek: 4,
      hour: 18,
      label: 'Чт, 18:00',
      score: 91.2,
      avgViews: 5200,
    },
  ],
  formatGuidance: {
    channelId: 1,
    channelTitle: 'Мой канал',
    bestLengthBucket: 'medium',
    bestLengthLabel: 'Средние (301-1000 симв.)',
    recommendedRangeLabel: '300-1000 зн.',
    bestStructureSignal: 'question_hook',
    bestStructureLabel: 'Вопрос в зачине',
    withMediaRecommended: true,
    withLinksRecommended: false,
    summaryText: 'Оптимальный формат для вашего канала: 300-1000 зн. с медиа · Лучшие окна: Чт, 18:00',
  },
};

describe('ContentPlanBoard', () => {
  it('renders empty state and recommendation banner when there are no saved posts', () => {
    render(
      React.createElement(ContentPlanBoard, {
        posts: [],
        recommendations,
        onUpdatePlan: vi.fn(),
        onRemoveSaved: vi.fn(),
      }),
    );

    expect(
      screen.getByText(
        'Оптимальный формат для вашего канала: 300-1000 зн. с медиа · Лучшие окна: Чт, 18:00',
      ),
    ).toBeDefined();
    expect(screen.getByText('Лучший приём: Вопрос в зачине')).toBeDefined();
    expect(
      screen.getByText(
        'В избранном пока нет постов. Сохраните идеи из ленты поиска, чтобы вести здесь контент-план.',
      ),
    ).toBeDefined();
  });

  it('groups cards across 4 columns and triggers status, slot, draft, and remove callbacks', async () => {
    const onUpdatePlan = vi.fn().mockResolvedValue(undefined);
    const onRemoveSaved = vi.fn().mockResolvedValue(undefined);

    const posts: SearchPost[] = [
      makePost({ id: 11, savedStatus: 'idea' }),
      makePost({
        id: 12,
        savedStatus: 'ready',
        savedPlannedFor: '2026-11-19T15:00:00.000Z',
        savedDraftText: 'Готовый заход',
        channel: { id: 8, title: 'Design Daily', username: 'design_daily', niche: 'design' },
      }),
    ];

    render(
      React.createElement(ContentPlanBoard, {
        posts,
        recommendations,
        onUpdatePlan,
        onRemoveSaved,
      }),
    );

    expect(screen.getByLabelText('Колонка: Идеи')).toBeDefined();
    expect(screen.getByLabelText('Колонка: В работе')).toBeDefined();
    expect(screen.getByLabelText('Колонка: Готово к публикации')).toBeDefined();
    expect(screen.getByLabelText('Колонка: Опубликовано')).toBeDefined();

    expect(screen.getByText('Tech News')).toBeDefined();
    expect(screen.getByText('Design Daily')).toBeDefined();
    expect(screen.getAllByText('Заметка:')).toHaveLength(2);
    expect(screen.getAllByText('Медиа')).toHaveLength(2);

    // Assign best slot for post 11
    fireEvent.click(screen.getByRole('button', { name: 'Поставить в лучший слот: Чт, 18:00' }));
    await waitFor(() =>
      expect(onUpdatePlan).toHaveBeenCalledWith(11, { plannedFor: '2026-11-19T15:00:00.000Z' }),
    );

    // Edit and save draft text for post 11
    const textareas = screen.getAllByLabelText('Черновик адаптации');
    fireEvent.change(textareas[0], { target: { value: 'Новый черновик поста' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(onUpdatePlan).toHaveBeenCalledWith(11, { draftText: 'Новый черновик поста' }),
    );

    // Change status of post 11
    const selects = screen.getAllByLabelText('Статус карточки');
    fireEvent.change(selects[0], { target: { value: 'in_progress' } });
    await waitFor(() => expect(onUpdatePlan).toHaveBeenCalledWith(11, { status: 'in_progress' }));

    // Remove post 11 from saved
    const deleteButtons = screen.getAllByRole('button', { name: 'Удалить из закладок' });
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => expect(onRemoveSaved).toHaveBeenCalledWith(11));
  });
});
