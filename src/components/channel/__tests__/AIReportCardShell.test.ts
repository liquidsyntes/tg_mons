/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AIReportCardShell } from '../AIReportCardShell';

afterEach(cleanup);

function cardProps() {
  return {
    containerClassName: 'border-accent/30 border-l-accent',
    buttonClassName: 'bg-accent text-slate-950',
    accentClassName: 'text-accent',
    icon: React.createElement('span', null, 'Иконка'),
    title: 'Тестовый отчёт',
    description: 'Описание отчёта',
    buttonLabel: 'Сгенерировать',
    loadingLabel: 'Формирую...',
    loading: false,
    success: false,
    onSuccessClear: vi.fn(),
    onGenerate: vi.fn(),
    messages: ['Сбор данных...'],
    error: null,
    result: React.createElement('p', null, 'Сохранённый результат'),
    onDownload: vi.fn(),
  };
}

it('keeps the result and Markdown export visible alongside a later error', () => {
  const props = cardProps();
  render(React.createElement(AIReportCardShell, { ...props, error: 'Повторная генерация не удалась' }));

  expect(screen.getByText('Сохранённый результат')).toBeDefined();
  expect(screen.getByText('Повторная генерация не удалась')).toBeDefined();
  const exportButton = screen.getByRole('button', { name: 'Экспорт в MD' });
  expect(exportButton.hasAttribute('data-pdf-hide')).toBe(true);
  fireEvent.click(exportButton);
  expect(props.onDownload).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));
  expect(props.onGenerate).toHaveBeenCalledOnce();
});

it('disables generation while a request is running and shows its status', () => {
  const props = cardProps();
  render(React.createElement(AIReportCardShell, { ...props, loading: true, result: null }));

  const button = screen.getByRole('button', { name: 'Формирую...' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(screen.getByText('Сбор данных...')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Экспорт в MD' })).toBeNull();
});
