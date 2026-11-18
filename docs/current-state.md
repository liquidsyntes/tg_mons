# Current State

Дата снимка: 2026-11-18
Базовая ревизия: `fc01473`, main. Задача #97: исправление липкой шапки и карточки метрики VR/ERR на `/compare`.

## Реализовано

- В `src/components/compare/CompareControls.tsx` (`CompareTopBar`) позиционирование изменено с `sticky top-0 z-30` на `sticky top-16 z-20`, добавлены перенос `flex-wrap min-h-16 py-2 gap-3` для узких экранов и `aria-pressed` кнопкам выбора периода (`24ч`, `7 дней`, `30 дней`).
- В `src/components/compare/CompareSummarySection.tsx` оформлен раскрывающийся блок ограничений сравнения `<details>` (`bg-amber-500/10 border-amber-500/30 rounded-xl p-3.5`), а в парных карточках `CompareMetricCard` исправлена подпись значения `vr7d` с `ERR (7д)` на `VR (7д)`.
- В `src/components/__tests__/ComparePage.test.ts` добавлены проверки подписи `VR (7д)`, `aria-pressed` и отображения блока `Ограничения сравнения`. Схема БД, миграции и API `/api/stats/compare` не менялись.

## Проверки

- В `tgmon-web` прошли `npx tsc --noEmit` и `npx eslint src`.
- Целевой Vitest (`ComparePage.test.ts` и `multi-compare.test.ts`): 2 файла прошли, 5 тестов прошли.
- Полный Vitest в `tgmon-web`: 170 файлов прошли, 2 пропущены (PostgreSQL integration без test DB); 1093 теста прошли, 9 пропущены.
- Production-сборка `prisma generate && next build` (21/21 статических маршрутов, включая `/compare`) прошла при пересборке `tgmon-web`; сервис пересоздан и запущен с bind mount; `/api/health` HTTP 200.
- На хосте Vitest не запускается из-за отсутствующей native optional dependency rolldown; проверки выполнены в Docker.

## Ограничения и следующий шаг

- Визуальная проверка `/compare` в живом браузере не выполнялась без авторизованной пользовательской сессии.
- Сохраняются прежние ограничения #93 и статус #90 (ожидание реальных контрольных точек в окнах `[24,26]` и `[48,50]` часов). Production не обновлялся.

Следующий шаг: проверить `/compare` в авторизованной сессии браузера и приступить к задаче #98 (унификация цветовых акцентов `Last Fact` и раскрываемых блоков пояснений).
