# Текущее состояние и передача работы

Снимок: 14 ноября 2026 года (Europe/Moscow). База задачи: `c7a7598`, ветка `main`, upstream `origin/main`. Реализована группировка и аналитика эффективности рекламных креативов в режиме Ad Spy (GitHub Issue #76).

## Реализовано в исходниках

- В `src/lib/types.ts` добавлены контракты `AdCreativeSortBy`, `AdCreativePostItem`, `AdCreativeCluster` и опциональное поле `creativeClusters` в `GlobalPostSearchResponse`.
- Создан детерминированный модуль кластеризации `src/lib/metrics/ad-creatives.ts`: `normalizeCreativeText` (очистка URL, UTM-меток, `@упоминаний`, хэштегов, эмодзи и пунктуации), `extractCreativeShingles`, `calculateTextSimilarity`, `extractCreativeAdvertisers`, `sortAdCreativeClusters` и `clusterAdCreatives` (объединение схожих креативов с подсчётом `placementsCount`, `uniqueChannelsCount`, `totalViews`, `avgViews`, `avgEr`, `avgErr`, `maxErr`, `firstSeenAt`, `lastSeenAt` и определением `bestPlacement`).
- В `src/lib/posts-search.ts` добавлена поддержка query-параметров `includeCreatives` (`true` / `1`) и `creativesSortBy` (`placementsCount` | `totalViews` | `avgErr`) и расчёт `creativeClusters` в `searchPosts` (расширенная выборка до 250 подходящих рекламных постов при `includeCreatives=true` с сохранением обратной совместимости для прежних ответов).
- Создан компонент `src/components/posts/AdCreativesPanel.tsx` и интегрирован в `src/app/posts/page.tsx` для режима `Только реклама (Ad Spy)`: карточки кластеров с бейджами размещений/каналов и метриками охвата и ERR, переключатель сортировки (`По посевам`, `По охвату`, `По ERR`), фильтр сетевых посевов (`2+`), раскрывающийся список каналов размещения с подсветкой `Лучший ERR` и фильтрация ленты по выбранному креативу.
- Добавлены и расширены тесты: `src/lib/metrics/__tests__/ad-creatives.test.ts`, `src/components/posts/__tests__/AdCreativesPanel.test.ts`, `src/lib/__tests__/posts-search.test.ts`, `src/app/api/posts/search/__tests__/route.test.ts` и `src/app/posts/__tests__/page.test.ts`.
- Обновлена документация в `docs/analytics-formulas.md`, `docs/api-reference.md` и `docs/project-map.md`.

## Проверки

- Профильные тесты (`src/lib/metrics/__tests__/ad-creatives.test.ts`, `src/components/posts/__tests__/AdCreativesPanel.test.ts`, `src/lib/__tests__/posts-search.test.ts`, `src/app/api/posts/search/__tests__/route.test.ts`, `src/app/posts/__tests__/page.test.ts`): 61 тест в 5 файлах прошёл успешно.
- Полный набор `npm test`: 143 файла, 935 тестов прошли успешно.
- `npx tsc --noEmit`, `npx eslint src` и `npm run build`: завершены с кодом 0 без ошибок. Схема базы данных и миграции не менялись.
- Docker (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build web`): образ `tgmon-web` пересобран, контейнеры `tgmon-postgres` (healthy), `tgmon-worker` и `tgmon-web` запущены; `GET http://localhost:4000/api/health` вернул `200 OK` (`status: "ok"`, `lastSyncStatus: "COMPLETED"`, `channelsSucceeded: 26`, `channelsFailed: 0`).

## Следующий шаг

Перейти к следующим задачам из бэклога в GitHub Issues (`#77`–`#82`).
