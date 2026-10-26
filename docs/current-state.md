# Текущее состояние и передача работы

Снимок: 26 октября 2026 года. База задачи Issue #51: `db37a45`, ветка `main`, upstream `origin/main`; рабочее дерево до изменений было чистым. Перед следующей задачей проверить Git заново. Это состояние исходников и локальных проверок, не заключение о production.

## Реализовано в исходниках

- В `src/lib/alerts.ts` добавлена метрика `viralPostMultiplier` («Виральный пост (множитель к медиане охвата)», единица `x`), переиспользующая `calculateViralBaseline` из `src/lib/metrics/viral.ts` (30-дневная базовая линия канала, минимум 5 постов с `views > 0`).
- Добавлены функции `evaluateViralPostRule` (требует `operator = "gt"`, `threshold > 0`, `views >= 100` и `views >= threshold * medianViews`) и `formatViralPostAlert` (охват, фактический множитель к медиане, пересылки, сниппет текста до 200 символов и прямая ссылка `https://t.me/<username>/<messageId>`). Идемпотентность отправки на уровне поста обеспечивается таблицей `AlertRulePostFire` с откатом резервирования при сбое доставки.
- В `POST /api/alerts` добавлена валидация `metric = "viralPostMultiplier"` (`operator = "gt"`, `threshold > 0`), а в `AlertRulesSettings.tsx` на `/settings` при выборе этой метрики автоматически фиксируется условие «Больше» и предлагается порог `2` (`2.0x`).
- Обновлены `docs/api-reference.md`, `docs/database.md` и `docs/overview.md`. Дополнительная миграция БД не требовалась, так как используется таблица `AlertRulePostFire` из миграции `20261026201200_add_keyword_alert_rules`.

## Проверки текущей задачи

- Целевые тесты уведомлений и API (`src/lib/__tests__/alerts.test.ts`, `src/app/api/alerts/__tests__/route.test.ts`, `src/worker/__tests__/alert-collection.test.ts`, `src/worker/__tests__/rule-alert.test.ts`): 4 файла, 39 тестов прошли. Полный `npm test -- --maxWorkers=4`: 102 файла, 679 тестов прошли. `npx tsc --noEmit`, `npx eslint src` и `npm run build` прошли.
- `git diff --check` прошёл без ошибок. Живая отправка в Telegram Bot API и production не проверялись.

## Ограничения и следующий шаг

Правила `viralPostMultiplier` срабатывают на свежие посты за последние 24 часа только для каналов, где за 30 дней накоплено минимум 5 постов с ненулевыми просмотрами, и отправляют не более одного уведомления на пару `(ruleId, postId)`.

После доставки перед следующей задачей проверить `git status -sb` и выбрать относящиеся к ней исходники по [карте проекта](project-map.md). Исторические `.agents/` handoff-файлы не задают план следующей работы.
