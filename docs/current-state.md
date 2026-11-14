# Текущее состояние проекта

Дата среза: `2026-11-14`
Ветка: `main`, базовая ревизия до коммита Issue #78: `e7f8843`

## Реализовано в рамках текущей итерации (Issue #78)

Реализован контент-план (доска идей) на базе персональных закладок `UserSavedPost` с рекомендациями лучших слотов публикации и оптимального формата для «Моего канала»:

1. **База данных и миграция (`prisma/schema.prisma`)**:
   - В `model UserSavedPost` добавлены поля `status` (`@default("idea")`), `plannedFor` (`planned_for`), `draftText` (`draft_text`), `updatedAt` (`updated_at`) и индекс `@@index([userId, status])`.
   - Создана и применена миграция `prisma/migrations/20261114063600_add_content_plan_to_saved_posts/migration.sql`.
2. **Доменная логика и типы (`src/lib/metrics/content-plan.ts`, `src/lib/types.ts`)**:
   - Добавлены типы `ContentPlanStatus`, `SuggestedPublishSlot`, `ContentPlanFormatGuidance`, `ContentPlanRecommendations`, `SavedPostItem`, а также поля `savedStatus`, `savedPlannedFor`, `savedDraftText` в `SearchPost` и `AdCreativePostItem`.
   - Реализованы функции `suggestNextPublishSlots` (подбор ближайших свободных окон публикации на 7 дней вперёд по тепловой карте `best-time.ts` с исключением занятых слотов), `buildContentPlanFormatGuidance` (на базе `post-length.ts`: рекомендуемый диапазон длины, медиа/ссылки, структурные приёмы и 2 лучших окна), `isValidContentPlanStatus`, `groupSavedPostsByStatus` и `formatPlannedSlotDateTime`.
3. **API и поиск (`src/app/api/posts/saved/route.ts`, `src/lib/posts-search.ts`)**:
   - В `POST` и `PATCH /api/posts/saved` поддержаны частичное обновление и валидация `status` (`idea | in_progress | ready | published`), `plannedFor` (ISO-дата или `null`), `draftText` (до 4000 символов) и `note` (до 500 символов) при сохранении обратной совместимости одноразового добавления в закладки.
   - `GET /api/posts/saved` возвращает расширенные `savedPosts` и блок `recommendations` (`slots`, `formatGuidance`) для «Моего канала» пользователя.
   - В `src/lib/posts-search.ts` поля `savedStatus`, `savedPlannedFor`, `savedDraftText` прокинуты в выдачу поиска и Ad Spy.
4. **Интерфейс (`src/components/posts/ContentPlanBoard.tsx`, `src/app/posts/page.tsx`)**:
   - Создана 4-колоночная Канбан-доска `ContentPlanBoard` (`Идеи`, `В работе`, `Готово к публикации`, `Опубликовано`) с верхней плашкой-ориентиром для «Моего канала», редактором черновика `draftText`, сменой статуса, сбросом/быстрым назначением ближайшего лучшего слота и удалением из закладок.
   - На `/posts` добавлен переключатель **«Список закладок»** / **«Контент-план (Доска)»** при активном фильтре «В закладках» (включая инициализацию через `?saved=1` и `?view=board`).
5. **Документация**:
   - Обновлены `docs/api-reference.md`, `docs/database.md`, `docs/project-map.md` и текущий документ.

## Фактически выполненные проверки

- `npx prisma migrate deploy && npx prisma generate` - успешно, миграция `20261114063600_add_content_plan_to_saved_posts` применена к PostgreSQL, Prisma Client v6.19.3 сгенерирован.
- Профильные тесты (`content-plan.test.ts`, `ContentPlanBoard.test.ts`, `api/posts/saved/__tests__/route.test.ts`, `app/posts/__tests__/page.test.ts`, `api/posts/search/__tests__/route.test.ts`) - 5 файлов, 40 тестов пройдены.
- `npx tsc --noEmit && npx eslint src` - успешно, код возврата `0`.
- `npm test` - пройдены все `148` тестовых файлов (`959` тестов).
- `npm run build` - успешно (`prisma generate && next build`, 18/18 статических страниц).
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --renew-anon-volumes web worker` - контейнеры пересобраны и запущены; `GET http://localhost:4000/api/health` вернул `status: "ok"`, `lastSyncStatus: "COMPLETED"`, `channelsSucceeded: 26`, `channelsFailed: 0`.

## Незавершённое и известные ограничения

- При режиме «Контент-план (Доска)» выборка карточек на `/posts` следует активным фильтрам поиска (период `days`, канал/ниша и т.д.), а рекомендации `formatGuidance` формируются персонально только после отметки одного из каналов как «Мой канал».
- Существующая генерация адаптированного черновика ориентирована на ручное редактирование `draftText`; отдельная AI-кнопка генерации черновика по желанию может быть добавлена позднее поверх существующего поля `draftText`.

## Следующий шаг

Перейти к **Issue #79** (`feat(compare): добавь мульти-сравнение каналов и сравнение с папкой или нишей`; далее в очереди `#80`–`#82`).
