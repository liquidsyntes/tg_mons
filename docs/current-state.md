# Current State

Дата снимка: 2026-11-18
Базовая ревизия: `4b4981b`, main. Задача #99: индикация активного раздела в `Header` и клавиатурная доступность списка отчётов и мобильной кнопки избранного.

## Реализовано

- В `src/components/Header.tsx` добавлено определение активного маршрута через `usePathname()` (с фолбэком на `window.location.pathname` для совместимости с тестами без App Router context) и синхронизация query-строки `/posts` через `popstate` и `tgmon:posts-navigate`. Подсвечены активные разделы (`Каналы`, `Публикации`, `Аналитика`, `Управление` при `/settings*`), а активным ссылкам в десктопном и мобильном меню задан `aria-current="page"`.
- В `src/components/ReportsListClient.tsx` выбор отчёта для сравнения переведён с `<div onClick>` на кнопку `<button type="button" role="checkbox" aria-checked={isSelected} aria-label={...}>`, поддерживающую `Tab`, `Space` и `Enter`.
- В `src/components/channel/ChannelsMobileList.tsx` кнопка переключения избранного получила `type="button"`, `aria-label` (`Добавить в избранное` / `Убрать из избранного`), `aria-pressed` и увеличенную область клика (`p-1.5 -m-1 rounded-lg`).
- Добавлены unit-тесты в `src/components/__tests__/Header-version.test.ts` (активные разделы и `aria-current="page"`), `src/components/__tests__/ReportsListClient.test.ts` (выбор отчётов через `role="checkbox"` и переключение `aria-checked`) и `src/components/__tests__/ui-polish.test.ts` (`aria-label`/`aria-pressed` для кнопки избранного в `ChannelsMobileList`). Схема БД, миграции и API не менялись.

## Проверки

- В `tgmon-web` прошли `npx tsc --noEmit` и `npx eslint src`.
- Целевой Vitest (`Header-version.test.ts`, `ReportsListClient.test.ts`, `ui-polish.test.ts`): 3 файла прошли, 32 теста прошли.
- Полный Vitest в `tgmon-web`: 170 файлов прошли, 2 пропущены (PostgreSQL integration без test DB); 1099 тестов прошли, 9 пропущены.
- Production-сборка `prisma generate && next build` (21/21 статических маршрутов) прошла при пересборке `tgmon-web`; сервис пересоздан и запущен с bind mount; `/api/health` вернул HTTP 200.
- На хосте Vitest не запускается из-за отсутствующей native optional dependency rolldown; проверки выполнены в Docker.

## Ограничения и следующий шаг

- Интерактивная проверка в авторизованной браузерной сессии на `/`, `/posts`, `/reports`, `/compare` и `/settings` после правки не выполнялась.
- Сохраняются прежние ограничения #93 и статус #90 (ожидание реальных контрольных точек в окнах `[24,26]` и `[48,50]` часов). Production не обновлялся.

Следующий шаг: приступить к задаче #100 (замена блокирующих `alert()` на встроенные статусные баннеры в афише событий).
