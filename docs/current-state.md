# Текущее состояние проекта

Дата обновления: 2026-11-15  
Ветка: `main` (базовая ревизия `70c2aef`)

## Реализовано в текущем цикле

- Выполнен **Issue #81** (`feat(fraud): добавь почасовую эвристику профиля набора просмотров и ночных аномалий`):
  - **Контракты и реэкспорты** (`src/lib/fraud/types.ts`, `src/lib/fraudDetector.ts`): добавлены `FraudPostSnapshotInput`, `FraudEngagementHourInput`, `HourlyViewProfileOptions`, `NightBotActivityOptions`, `HourlyViewProfileResult`, `NightBotActivityResult`, расширены `FraudAuditResult.details` (`unnaturalViewDecay`, `nightBotActivity`), `SimulatedFraudFlags` и `FraudAuditChannelInput`.
  - **Эвристики и нормализация** (`src/lib/fraud/heuristics.ts`, `src/lib/fraud/normalizers.ts`, `src/lib/fraud/audit.ts`): реализованы `checkHourlyViewProfile` (`unnatural_view_decay`: поздний добор просмотров >50% после 24ч или равномерные линейные шаги `CV < 0.15` при отсутствии входящих `Mention` или вирусных пересылок) и `checkNightBotActivity` (`night_bot_activity`: >=30% прироста просмотров в окне `02:00-05:59` в `APP_TIMEZONE` при >=80% интервалов с нулевым откликом по `PostEngagementHour` / нулевым счётчикам), защита от нехватки данных (<5 постов с >=3 снимками не штрафует балл), резолверы приоритетов и интеграция в `runFraudAudit` (+25 баллов за каждый сигнал с потолком `100`).
  - **Worker** (`src/worker/fraud-evaluator.ts`): обновлён `evaluateAndSaveChannelFraudSignals` для загрузки `snapshots`, `viewSnapshots`, `engagementHours` и входящих `Mention` с сохранением/очисткой сигналов `unnatural_view_decay` и `night_bot_activity` через `saveFraudSignal`.
  - **UI** (`src/components/RiskBadge.tsx`, `src/components/channel/ChannelHeader.tsx`): добавлены `getFraudSignalLabel`, русскоязычные подписи в тултипе и блок активных сигналов антифрода (`data-testid="channel-fraud-signals"`) в шапке канала.
  - **Тесты и документация**: обновлены `src/lib/__tests__/fraudDetector.test.ts`, `src/lib/fraud/__tests__/normalizers.test.ts`, `src/worker/__tests__/fraud-evaluator.test.ts`, `src/components/__tests__/RiskBadge.test.ts`, `src/components/__tests__/channel-detail-ui.test.ts`, а также `docs/analytics-formulas.md`, `docs/project-map.md` и `docs/current-state.md`.

## Выполненные проверки

- `npx tsc --noEmit`: 0 ошибок.
- `npx eslint src`: 0 ошибок.
- `npm test`: 153 тестовых файла, 1000 тестов пройдены.
- `npm run build`: `prisma generate && next build` завершены успешно (19 статических маршрутов).

## Ожидающие работы и блокеры

- Блокеров нет; изменений схемы БД и новых миграций Prisma не требовалось.

## Следующий шаг

- Перейти к планированию и реализации **Issue #82** (`feat(bot): добавь интерактивные команды Telegram-бота для быстрой проверки каналов и дайджеста`).
