# Current State

Дата снимка: 2026-11-24
Базовая ревизия: `2a0e50c`, main. Закрытие техдолга (1/4) по GitHub Issue `#107` (безопасность зависимостей, строгие типы без `any`, `border-radius: 3px`, удаление `U+2014` из `src/` и проверка в CI).

## Реализовано

- **Зависимости и аудит (`package.json`, `package-lock.json`)**:
  - Обновлён `next` с `15.5.28` до `^15.5.29` (закрыты 3 moderate CVE `GHSA-7qx7-33qx-rqx2`, `GHSA-f3mh-rxg3-f5g2`, `GHSA-pc58-hwjq-p385`).
  - Зафиксирован статус оставшейся цепочки в `npm audit --omit=dev`: high-уязвимость `effect <= 3.22.0` (`GHSA-7589-6fvf-x4pw`) через `@prisma/config` -> `prisma@6.19.3` относится к dev/CLI-инструментарию Prisma и не затрагивает runtime; откат до `prisma@6.12.0` или переход на Prisma 7/8 не выполнялся (оставлено вне рамок `#107`).
- **Удаление `any` в `src/`**:
  - Заменены все 16 не-тестовых вхождений `any` в 12 файлах `src/`:
    - `src/lib/types.ts`: `epBreakdown?: EPResult['breakdown']` и `scoreBreakdown?: ScoreBreakdown`;
    - `src/worker/demographics.ts`: явный тип `Api.stats.BroadcastStats`;
    - `src/components/channel/useChannelsData.ts`: `valA: number`, `valB: number`;
    - `catch (err/error: unknown)` с проверкой `instanceof Error` и безопасным fallback в `src/app/page.tsx`, `src/components/AddChannelModal.tsx`, `src/components/GenerateActionPlanButton.tsx`, `src/components/ReportsListClient.tsx`, `src/app/api/channels/route.ts`, `src/app/api/channels/[id]/route.ts`, `src/app/api/channels/[id]/favorite/route.ts`, `src/app/api/channels/[id]/ltv/route.ts`, `src/app/api/events/route.ts`.
  - Дополнительно обновлена устаревшая mock-фикстура `scoreBreakdown` в `src/components/__tests__/ComparePage.test.ts` под реальный контракт `ScoreBreakdown` (ошибку выявил `tsc --noEmit` после снятия `any`).
  - Оставшиеся 1 вхождение в `scripts/fix_grouped_posts.ts` и 23 в тестовых файлах `src/` не менялись (вне объёма `#107`; ревизия `scripts/` вынесена в `#108`).
- **UI radius (`src/components/channel/WrappedCard.tsx`)**:
  - Заменён `rounded-[2rem]` на `rounded-3xl` (`3px` согласно `tailwind.config.js`).
- **Удаление `U+2014` из `src/` и автоматическая проверка в CI**:
  - Заменены все 35 вхождений `U+2014` в 18 файлах `src/` (включая `src/app/about/stitch.html`, AI-промпты, компоненты, `src/worker/auth.ts`, `src/lib/ai-markdown.ts` и тест `src/lib/__tests__/ai-markdown.test.ts`) на `-`, а в UI-заглушках пустых значений (`MetricCell.tsx`, `WatchlistWidget.tsx`, `ChannelHeader.tsx`) - на `–` (`U+2013`).
  - В `.github/workflows/ci.yml` добавлен шаг `Check forbidden U+2014 in src`, проверяющий `src/` через Node-скрипт (с комментарием о расширении на `docs/` и `scripts/` в `#108`).

## Проверки

- Поиск не-тестовых `any` в `src/`: `0` совпадений.
- Поиск `rounded-[` в `src/components/channel/WrappedCard.tsx`: `0` совпадений.
- Поиск `U+2014` в `src/` (`git grep` и точный скрипт шага CI в `tgmon-web`): `0` совпадений (`OK: 0 occurrences of U+2014 in src/`).
- `npm audit --omit=dev`: `0` уязвимостей `next`; осталась только задокументированная цепочка `effect <= 3.22.0 -> @prisma/config -> prisma` (3 high).
- В `tgmon-web`: `npx tsc --noEmit` (код `0`), `npx eslint src` (код `0`).
- Полный Vitest в `tgmon-web` (`npm test -- --maxWorkers=2`): `173` файла пройдены, `2` пропущены (PostgreSQL integration `store.integration.test.ts` и `publication-performance.integration.test.ts` без test DB); `1116` тестов пройдены, `9` пропущены.
- Изолированная production-сборка `docker compose run --rm --no-deps -e NODE_ENV=production web npm run build`: код `0`, `22/22` статических страниц.
- Пересборка и запуск Docker (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`): `tgmon-web`, `tgmon-worker`, `tgmon-postgres` в статусе `Up`, `http://localhost:4000/api/health` вернул HTTP `200` (`status: ok`).
- На хосте Vitest по-прежнему не запускается из-за отсутствующей native optional dependency `rolldown`; все JS/TS-проверки выполнены в Docker.

## Ограничения и следующий шаг

- Вне `src/` (в `docs/`, `scripts/`, `.agents/`, `.env.example`, `docker-compose.prod.yml`) сохраняются вхождения `U+2014` и артефакты репозитория - это вынесено в открытую задачу `#108` (часть 2/4), за ней следуют `#109` (3/4) и `#110` (4/4).
- Сохраняются прежние задачи и ограничения по `#90` (ожидание контрольных точек постов в окнах `[24,26]` и `[48,50]` часов). Production не обновлялся.

Следующий шаг: перейти к выполнению GitHub Issue `#108` (очистка артефактов репозитория, выравнивание `lint`/ESLint и синхронизация `docs/` с актуальными 30 моделями и 37 миграциями).
