# Current State

Дата снимка: 2026-11-24
Базовая ревизия: `3d13264`, main. Закрытие техдолга (2/4) по GitHub Issue `#108` (очистка артефактов и одноразовых скриптов, выравнивание ESLint и `npm run lint`, синхронизация `docs/` и очистка репозитория от `U+2014`).

## Реализовано

- **Очистка артефактов и `.gitignore` (`b590379`)**:
  - Удалены из git 170 исторических файлов `.agents/` и 5 устаревших/служебных файлов в корне (`audit-metrics.log`, `diff.patch`, `design-qa.md`, `PROJECT.md`, `skill.md`), история git не перезаписывалась.
  - В `.gitignore` добавлены правила `.agents/` и `*.patch` (`*.log` уже присутствовал).
- **Ревизия `scripts/` (`39801d4`)**:
  - Удалены 6 одноразовых/нерабочих скриптов (`scripts/patch_ai.js`, `scripts/fix_grouped_posts.ts`, `scripts/test_scrape.ts`, `scripts/check_gramjs.ts`, `scripts/inspect_msg.ts`, `scripts/query_posts.ts`).
  - Обновлён [scripts/README.md](scripts/README.md) (удалены строки 6 удалённых скриптов, дата актуализирована на 24 ноября 2026 года, убраны 5 вхождений `U+2014`) и очищен от `U+2014` файл [scripts/auth/auth-file.ts](scripts/auth/auth-file.ts); в `scripts/` осталось `0` вхождений `any`.
- **Выравнивание ESLint и CI (`4943fe8`, `3d13264`)**:
  - В [package.json](package.json) скрипт `"lint"` заменён с `"next lint"` на `"eslint src"`; в `devDependencies` добавлены `"eslint": "^9.39.5"` и `"@eslint/eslintrc": "^3.3.7"`, выровнена версия `"eslint-config-next": "^15.5.29"`, удалён конфликтовавший с ней `"eslint-plugin-react-hooks": "^7.1.1"`.
  - [eslint.config.mjs](eslint.config.mjs) переведён на `FlatCompat` (`...compat.extends('next')`), так как `eslint-config-next@15.5.29` поставляется в legacy-формате.
  - В [.github/workflows/ci.yml](.github/workflows/ci.yml) шаг линтинга переведён на `npm run lint` (убран устаревший комментарий про `fix*.js`/`export_block.js`), а шаг `Check forbidden U+2014` расширен на `src/`, `docs/` и `scripts/`.
- **Синхронизация `docs/` и очистка `U+2014` (`3d13264`)**:
  - Обновлены [docs/database.md](docs/database.md), [docs/architecture.md](docs/architecture.md), [docs/deployment.md](docs/deployment.md), [docs/api-reference.md](docs/api-reference.md) под актуальное состояние: `30` моделей, `4` enum (`UserAccessStatus`, `SyncStatus`, `AiBudgetMode`, `AiOperationStatus`), `37` миграций и `58` файлов `route.ts` в `src/app/api/`; добавлены описания `PublicationCollectionRun`, `AiBudgetNotice`, `AiBudgetMode` и последних 4 миграций (`20261116043000`..`20261117090000`).
  - Заменены все вхождения `U+2014` в `docs/`, `scripts/`, `.env.example`, `docker-compose.prod.yml`, `README.md`, `.gitattributes`, `.github/workflows/docker-publish.yml`, `issue-cert.sh` (`–` в пустых ячейках таблиц, `-` в остальном тексте).

## Проверки

- `git ls-files .agents` и проверка удалённых артефактов/скриптов: `0` отслеживаемых файлов.
- Поиск `any` в `scripts/`: `0` совпадений.
- Самопроверка детектора `U+2014` на тестовой строке: `SELF_TEST_FOUND=["sample:2"]`; поиск `U+2014` по всему репозиторию (`git grep`): `0` совпадений; точный скрипт CI-шага в `tgmon-web`: `OK: 0 occurrences of U+2014 in src/, docs/, scripts/`.
- Сверка `docs/` с `prisma/schema.prisma`, `prisma/migrations/` и `src/app/api/**/route.ts`: отсутствующих моделей `0`, отсутствующих enum `0`, отсутствующих маршрутов `0/58`, все 4 последние миграции отражены.
- В `tgmon-web`: `npm run lint` (`eslint src`) -> код `0`, `npx tsc --noEmit` -> код `0`.
- Полный Vitest в `tgmon-web` (`npm test -- --maxWorkers=2`): `173` файла пройдены, `2` пропущены (PostgreSQL integration `store.integration.test.ts` и `publication-performance.integration.test.ts` без test DB); `1116` тестов пройдены, `9` пропущены.
- Изолированная сборка `docker compose run --rm --no-deps -e NODE_ENV=production web npm run build`: код `0`, `22/22` статических страниц.
- Пересборка и запуск Docker (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`): `tgmon-web`, `tgmon-worker`, `tgmon-postgres` в статусе `Up`, `http://localhost:4000/api/health` вернул HTTP `200` (`status: ok`).
- На хосте Vitest не запускается из-за отсутствующей native optional dependency `rolldown`; все JS/TS-проверки выполнены в Docker.

## Ограничения и следующий шаг

- В силе остаётся задокументированная по `#107` транзитивная уязвимость `effect <= 3.22.0 -> @prisma/config -> prisma@6.19.3` (dev/CLI инструмент, не runtime).
- В серии техдолга открытыми остаются `#109` (часть 3/4) и `#110` (часть 4/4), а также задача `#90` (ожидание контрольных точек постов в окнах `[24,26]` и `[48,50]` часов). Production не обновлялся.

Следующий шаг: перейти к выполнению GitHub Issue `#109` (декомпозиция крупных модулей, объединение форматтеров и ограничение `TTLCache`).
