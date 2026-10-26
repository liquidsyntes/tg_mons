# Текущее состояние и передача работы

Снимок: 26 октября 2026 года. База задачи Issue #50: `1b101cd`, ветка `main`, upstream `origin/main`; рабочее дерево до изменений было чистым. Перед следующей задачей проверить Git заново. Это состояние исходников и локальных проверок, не заключение о production.

## Реализовано в исходниках

- В `AlertRule` добавлено nullable-поле `keywordQuery` (`keyword_query`) и создана таблица `AlertRulePostFire` (`alert_rule_post_fires`) с уникальным индексом `(ruleId, postId)`. Миграция `20261026201200_add_keyword_alert_rules` расширяет схему без изменения существующих правил.
- В `src/lib/alerts.ts` добавлена метрика `keyword` («Упоминание ключевого слова»), нормализация списка ключевых слов/фраз через запятую (`normalizeKeywordQuery`, до 100 символов), регистронезависимый поиск (`matchKeywordRule`), идемпотентное резервирование отправки на уровне поста (`AlertRulePostFire`) с откатом при сбое доставки и формирование текста уведомления со сниппетом (до 200 символов) и ссылкой `https://t.me/<username>/<messageId>`.
- В `POST /api/alerts` добавлена валидация и проверка дубликатов для правил `metric = "keyword"`, а на странице `/settings` (`AlertRulesSettings.tsx`) поддержаны создание и отображение правил по ключевым словам.
- Обновлены `docs/database.md`, `docs/api-reference.md` и `docs/overview.md`.

## Проверки текущей задачи

- SQL миграции просмотрен. `npx prisma generate` прошёл на хосте и в локальном контейнере `web`. Миграция `20261026201200_add_keyword_alert_rules` применена к локальной PostgreSQL через Compose (`prisma migrate deploy`), `prisma migrate status` подтвердил актуальность схемы.
- Целевые тесты уведомлений и API (`src/lib/__tests__/alerts.test.ts`, `src/app/api/alerts/__tests__/route.test.ts`, `src/worker/__tests__/alert-collection.test.ts`, `src/worker/__tests__/rule-alert.test.ts`): 4 файла, 35 тестов прошли. Полный `npm test -- --maxWorkers=4`: 102 файла, 675 тестов прошли. `npx tsc --noEmit`, `npx eslint src` и `npm run build` прошли.
- Контейнер `web` перезапущен; `/login` ответил HTTP 200, неавторизованный `/api/alerts` ответил HTTP 401. Реальная отправка в Telegram Bot API и production не проверялись.
- `git diff --check` прошёл без ошибок.

## Ограничения и следующий шаг

Правила `keyword` проверяют непустые тексты постов активных каналов за последние 24 часа и отправляют не более одного уведомления на пару `(ruleId, postId)`. Ссылка на пост в уведомлении формируется при наличии публичного `username` у канала.

После доставки перед следующей задачей проверить `git status -sb` и выбрать относящиеся к ней исходники по [карте проекта](project-map.md). Исторические `.agents/` handoff-файлы не задают план следующей работы.
