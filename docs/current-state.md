# Current State

Дата снимка: 2026-11-18
Базовая ревизия: `fba4014`, main. Задача #98: унификация цветовых акцентов `Last Fact` и раскрываемых блоков пояснений.

## Реализовано

- Унифицирован цветовой акцент метрики `Last Fact` на единый токен `text-emerald-400` в `src/components/channel/ChannelsDesktopTable.tsx` (ранее `text-[#6cd733]`), `src/components/channel/ChannelsMobileList.tsx` (ранее `text-[lime]`) и `src/components/channel/ChannelHeader.tsx` (ранее `text-sky-400`).
- Оформлен компонент раскрываемых оснований `src/components/DataEvidenceDetails.tsx`: добавлены карточный контейнер `rounded-xl border border-border/70 bg-slate-900/50`, стилизация `<summary>` и отступы/разделитель раскрываемого тела без изменения доменных текстов.
- Секция «Замеры публикаций» (`publicationRuns`) в `src/components/settings/OperationsMonitorSettings.tsx` приведена к карточному стилю настроек (`rounded-xl border border-border bg-slate-900/40 p-3.5`) с использованием `statusLabels` / `statusColors` и `font-mono tabular-nums` для счётчиков.
- В `src/components/__tests__/ui-polish.test.ts` добавлены 3 unit-теста: единый `text-emerald-400` для `Last Fact`, рендер `DataEvidenceDetails` (`sufficient`/`partial`/`fallback`) и рендер `publicationRuns` в `OperationsMonitorSettings`. Схема БД, миграции и API не менялись.

## Проверки

- В `tgmon-web` прошли `npx tsc --noEmit` и `npx eslint src`.
- Целевой Vitest (`ui-polish.test.ts` и `channel-detail-ui.test.ts`): 2 файла прошли, 33 теста прошли.
- Полный Vitest в `tgmon-web`: 170 файлов прошли, 2 пропущены (PostgreSQL integration без test DB); 1096 тестов прошли, 9 пропущены.
- Production-сборка `prisma generate && next build` (21/21 статических маршрутов) прошла при пересборке `tgmon-web`; сервис пересоздан и запущен с bind mount; `/api/health` HTTP 200.
- На хосте Vitest не запускается из-за отсутствующей native optional dependency rolldown; проверки выполнены в Docker.

## Ограничения и следующий шаг

- Визуальный осмотр обновлённых акцентов и карточек на `/`, `/channel/[id]`, `/posts` и `/settings` в живом браузере после правки не выполнялся без авторизованной пользовательской сессии.
- Сохраняются прежние ограничения #93 и статус #90 (ожидание реальных контрольных точек в окнах `[24,26]` и `[48,50]` часов). Production не обновлялся.

Следующий шаг: приступить к задаче #99 (индикация активного раздела в `Header`, клавиатурная доступность чекбоксов на `/reports` и кнопки избранного в `ChannelsMobileList`).
