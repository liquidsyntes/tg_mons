# Current State

Дата снимка: 2026-11-15  
Базовая ревизия: `a405c39` (`main`, синхронизирован с `origin/main`, релиз `v1.56` на `6fca9bb`)

## Что реализовано

Выполнена полная сверка и синхронизация документации репозитория с текущим состоянием кода (`v1.56`):

- [README.md](../README.md): актуализированы дата сверки (15 ноября 2026 года, `v1.56`), архитектурная диаграмма (`25 таблиц`, `BotPoller`, `10 AI-отчётов`), разделы возможностей (`Newsjacking Speed`, мульти-сравнение `/compare`, `ContentPlanBoard`, кластеризация креативов `AdCreativesPanel`, трекер `AdPlacement` и удержание `1/24` и `2/48`, `Медиакит PDF`, `er30d`/`err30d`, `PostLengthPerformance`, `timelineEvents`, 6 эвристик антифрода, 10 AI-маршрутов с `metrics-explainer`, команды Telegram-бота `/start`, `/help`, `/status`, `/digest`, `/channel`, `/add`, `/events`, `/event`, `/dismiss`), таблица переменных окружения и описание GHCR workflow (`docker-publish.yml`).
- [docs/overview.md](overview.md): обновлены пользовательские сценарии, таблица страниц (`/`, `/channel/:id`, `/posts`, `/compare`, `/events`), разделы аналитики, AI (`10 маршрутов`) и диаграмма Telegram-бота.
- [docs/architecture.md](architecture.md): обновлены контейнерная и компонентная схемы, схема worker с `BotPoller` и восстановлением после `execution:missed`, изоляция ошибок сессии `isSessionAuthError`, 25 моделей Prisma и 33 миграции.
- [docs/database.md](database.md): обновлены ER-диаграмма (`25 моделей`), сводная таблица, связи `Channel`/`Post`, подробная спецификация модели `AdPlacement` (`ad_placements`), типы `AiReport` (`metrics_explainer`) и `FraudSignal` (6 типов), схема каскадов и список из 33 миграций (`20261114063600`, `20261114042500`, `20261113053607` и др.).
- [docs/analytics-formulas.md](analytics-formulas.md), [docs/api-reference.md](api-reference.md), [docs/deployment.md](deployment.md), [docs/project-map.md](project-map.md), [docs/adr/0001-anti-fraud-detection-architecture.md](adr/0001-anti-fraud-detection-architecture.md): синхронизированы даты сверки (`15 ноября 2026 года`, `v1.56`), ссылки на исходники, схемы, 6 детекторов антифрода, поведение `PATCH /api/events/:id/dismiss` с `UserDismissedEvent` и workflow `docker-publish.yml`.

## Выполненные проверки

- Для текущих правок документации проверены:
  - отсутствие запрещённых символов `U+2014` во всех добавленных/изменённых строках;
  - отсутствие пробельных ошибок (`git diff --check`);
  - наличие целевых файлов для относительных Markdown-ссылок и экранирование меток Mermaid в обновлённых документах;
  - сопоставление чисел моделей (`25`), миграций (`33`), AI-маршрутов (`10`), детекторов антифрода (`6`) и workflow с актуальным деревом репозитория.
- Код приложения, тесты и Docker-образы не менялись (`docs-only` обновление; актуальные кодовые и runtime-проверки зафиксированы на коммите релиза `6fca9bb`: `tsc`, `eslint`, `npm test` 155/1018, `npm run build` 19/19, Docker `/api/health` 200 OK).

## Непроверенное / остаточные риски

- При следующем добавлении новых моделей Prisma, маршрутов API, эвристик или переменных окружения потребуется точечно обновить соответствующие разделы документации и дату сверки.

## Следующий конкретный шаг

Продолжить развитие проекта поверх актуальной кодовой и документационной базы `v1.56`.
