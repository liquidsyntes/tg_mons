# Handoff Report: Audit of Local Development & Docker Documentation (R1)

## Executive Summary
Проведён полный аудит файлов `docker-compose.yml`, `docker-compose.dev.yml`, `Dockerfile.web`, `Dockerfile.worker`, `package.json`, `GEMINI.md`, `docs/deployment.md` и `README.md` в отношении требования **R1 (Local Development & Docker changes)**.

Выявлены критические фактологические расхождения:
1. В `README.md` (строка 56) сохранено устаревшее описание Режима 2: *«PostgreSQL и worker в Docker с локальным Next.js»*, тогда как в `docs/deployment.md` (строка 70) Режим 2 уже переведён на *«Локальная разработка (Всё в Docker)»*.
2. В `README.md` полностью отсутствует команда локальной разработки с Hot Reload: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`, а файл `docker-compose.dev.yml` не упоминается вовсе.
3. В `README.md` как основной метод быстрого старта предлагается запуск на хосте (`npm run dev:all`), что прямо противоречит правилу из `GEMINI.md`: *«For local development with Hot Reload, you MUST run the `web` container inside Docker... Do NOT run `npm run dev` locally on the host machine»*.
4. В `docs/deployment.md` недавно была добавлена команда `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`, однако в описании шагов отсутствует чёткая последовательность применения миграций (БД должна быть предварительно запущена), Режим 1 (на хосте) по-прежнему идёт первым, а дата сверки в строке 3 устарела (17 сентября 2026 года вместо 20 сентября 2026 года).

---

## Ответы на ключевые вопросы исследования

### 1. Текущая конфигурация в docker-compose.yml vs docker-compose.dev.yml. Как Next.js работает внутри Docker для локальной разработки с Hot Reload?
- **`docker-compose.yml` (production-база):**
  - Сервис `web` (строки 15–34) собирается из `Dockerfile.web` (где `ENV NODE_ENV=production`, выполняется `RUN npm run build`, `CMD ["npm", "start"]`). Пробрасывает порт `4000:4000`.
  - Сервис `worker` (строки 35–54) собирается из `Dockerfile.worker` (где `CMD ["npm", "run", "worker"]`, что запускает `npx tsx src/worker/index.ts` без отслеживания изменений).
  - Сервис `postgres` (строки 2–14) поднимает PostgreSQL 15 с портом `5432:5432`.
- **`docker-compose.dev.yml` (dev-override для локальной разработки):**
  - Для `web`:
    - Переопределяет команду: `command: npm run dev` (в `package.json` это `next dev -p 4000`).
    - Устанавливает переменные окружения: `NODE_ENV=development` и `WATCHPACK_POLLING=true`.
    - Пробрасывает тома:
      - `.:/app` — bind-mount рабочей директории хоста в `/app` контейнера, благодаря чему правки кода на хосте мгновенно попадают в контейнер.
      - `/app/node_modules` — анонимный том, изолирующий Linux-модули контейнера от локальных модулей хоста (предотвращает конфликты Windows/Linux бинарников).
      - `/app/.next` — анонимный том, изолирующий кэш сборки dev-сервера Next.js.
  - Для `worker`:
    - Переопределяет команду: `command: npx tsx watch src/worker/index.ts` (автоматический перезапуск воркера при изменении исходников).
    - `environment: NODE_ENV=development`.
    - `volumes: .:/app` и `/app/node_modules`.
- **Механизм Hot Reload:**
  Next.js запускается в режиме разработки (`next dev -p 4000`). Переменная `WATCHPACK_POLLING=true` критически важна для Windows/WSL2/Docker Desktop, так как стандартные события файловой системы `inotify` не всегда передаются через bind mount томов Docker. Watchpack переходит на опрос (polling), корректно обнаруживает изменения файлов и запускает Fast Refresh / Hot Reload без перезапуска контейнера.

### 2. Точная мультифайловая команда и её представление в документации
- **Точная команда:**
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
  ```
- **Представление в `docs/deployment.md`:**
  - Присутствует в строке 75 в разделе `## Режим 2: Локальная разработка (Всё в Docker)`.
  - Однако текстовые шаги перед ней (строка 72) лаконичны (*«Установите зависимости, сгенерируйте Prisma Client, выполните auth и миграции на хосте»*) и не дают пошаговых команд для оператора (например, что перед миграцией на хосте нужно поднять postgres: `docker compose up -d postgres`).
- **Представление в `README.md`:**
  - **ПОЛНОСТЬЮ ОТСУТСТВУЕТ**. Ни разу не упоминается ни сама команда, ни файл `docker-compose.dev.yml`.
  - Вместо этого строка 56 содержит устаревшую фразу: *«[Инструкция развёртывания](docs/deployment.md) описывает три режима: всё на хосте, PostgreSQL и worker в Docker с локальным Next.js, полный Compose»*.

### 3. Монтирование исходного кода и запуск `npm run dev` внутри контейнера
- В `docker-compose.dev.yml` (строки 8–13):
  ```yaml
  volumes:
    - .:/app
    - /app/node_modules
    - /app/.next
  ```
- Хостовая папка `.` монтируется в `/app`.
- Исключения `/app/node_modules` и `/app/.next` создают независимые анонимные тома Docker, чтобы скомпилированные в образе `node:22-alpine` зависимости не затирались хостовыми файлами.
- Команда `command: npm run dev` переопределяет директиву `CMD ["npm", "start"]` из `Dockerfile.web`.
- В `package.json` скрипт `"dev": "next dev -p 4000"` запускает Next.js на порту 4000. В `docker-compose.yml` порт `4000:4000` опубликован на хост.

### 4. Устаревшие инструкции и устаревшие/противоречивые команды
1. **`README.md` (строка 56):** упоминание несуществующего режима *«PostgreSQL и worker в Docker с локальным Next.js»*.
2. **`README.md` (строки 22–53):** раздел *«## Быстрый старт на хосте»* с рекомендацией `npm run dev:all` как основного пути старта. Это противоречит `GEMINI.md` (*«Do NOT run `npm run dev` locally on the host machine»*). Основным разделом должен быть запуск в Docker с hot reload.
3. **`README.md` (строки 54–68):** раздел *«Docker и развёртывание»* описывает исключительно production-сборку (`docker compose build web worker`), опуская dev-сборку с hot reload.
4. **`docs/deployment.md` (строка 3):** дата *«Сверено 17 сентября 2026 года»* устарела.
5. **`docs/deployment.md` (строки 53–79):** Режим 1 (на хосте) подан первым, тогда как рекомендуемым и соответствующим `GEMINI.md` является Режим 2 (Всё в Docker). В Режиме 2 пропущен явный шаг запуска БД для наката миграций.

### 5. Точный план правок для docs/deployment.md и README.md
(См. раздел Conclusion ниже с детальными фрагментами).

---

## 1. Observation (Наблюдения с прямыми цитатами)

### A. Файл `docker-compose.yml`
```yaml
15:   web:
16:     build:
17:       context: .
18:       dockerfile: Dockerfile.web
19:     container_name: tgmon-web
20:     restart: unless-stopped
21:     ports:
22:       - "4000:4000"
23:     environment:
24:       DATABASE_URL: "postgresql://postgres:password@postgres:5432/tgmon?schema=public"
...
35:   worker:
36:     build:
37:       context: .
38:       dockerfile: Dockerfile.worker
39:     container_name: tgmon-worker
...
51:       WEB_INTERNAL_URL: ${WEB_INTERNAL_URL:-http://web:4000}
```

### B. Файл `docker-compose.dev.yml`
```yaml
1: services:
2:   web:
3:     # Используем тот же образ, но переопределяем команду на dev
4:     command: npm run dev
5:     environment:
6:       - NODE_ENV=development
7:       - WATCHPACK_POLLING=true
8:     volumes:
9:       # Пробрасываем текущую папку внутрь контейнера
10:       - .:/app
11:       # Исключаем локальные node_modules и .next, чтобы не было конфликтов с контейнером
12:       - /app/node_modules
13:       - /app/.next
14: 
15:   worker:
16:     command: npx tsx watch src/worker/index.ts
17:     environment:
18:       - NODE_ENV=development
19:     volumes:
20:       - .:/app
21:       - /app/node_modules
```

### C. Файл `Dockerfile.web`
```dockerfile
1: FROM node:22-alpine AS base
...
8: RUN npm ci
...
11: RUN npx prisma generate
...
14: COPY . .
...
18: ENV NODE_ENV=production
19: RUN npm run build
20: 
21: EXPOSE 4000
22: CMD ["npm", "start"]
```

### D. Файл `GEMINI.md`
```markdown
16: ## Docker & Local Development
17: - **Dev Environment**: The `docker-compose.yml` and `Dockerfile.web` are configured for a **production** build. For local development with Hot Reload, you MUST run the `web` container inside Docker. Use the provided override file by running `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`. This will mount the source code as a volume and run `npm run dev` so changes are instantly reflected in the container. Do NOT run `npm run dev` locally on the host machine.
```

### E. Файл `README.md`
```markdown
22: ## Быстрый старт на хосте
...
44: ```bash
45: npm run dev:all
46: ```
...
54: ## Docker и развёртывание
55: 
56: [Инструкция развёртывания](docs/deployment.md) описывает три режима: всё на хосте, PostgreSQL и worker в Docker с локальным Next.js, полный Compose. Миграции не запускаются автоматически при старте контейнеров.
...
60: ```bash
61: docker compose up -d postgres
62: docker compose build web worker
63: docker compose run --rm --no-deps worker npm run prisma:migrate
64: docker compose up -d web worker
65: ```
```

### F. Файл `docs/deployment.md`
```markdown
3: Сверено 17 сентября 2026 года с [package.json](../package.json), [Compose](../docker-compose.yml), [dev override](../docker-compose.dev.yml), [Dockerfile.web](../Dockerfile.web), [Dockerfile.worker](../Dockerfile.worker) и [CI](../.github/workflows/ci.yml). Команды ниже — инструкции для оператора, а не подтверждение выполненного деплоя.
...
70: ## Режим 2: Локальная разработка (Всё в Docker)
71: 
72: Это рекомендуемая локальная схема с hot reload для web и worker. Установите зависимости, сгенерируйте Prisma Client, выполните auth и миграции на хосте. Запустите всё через Compose с использованием dev-конфигурации:
73: 
74: ```bash
75: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
76: ```
77: 
78: Compose автоматически смонтирует локальную папку и запустит `npm run dev` для web и `tsx watch` для worker. Web будет доступен на [localhost:4000](http://localhost:4000). Не запускайте `npm run dev` на хосте. Встроенный Compose-default `http://web:4000` работает корректно.
```

---

## 2. Logic Chain (Логическая цепочка)

1. **Базовый образ ориентирован на production**:
   - Наблюдение: `Dockerfile.web` содержит `RUN npm run build` и `CMD ["npm", "start"]`.
   - Вывод: Запуск `docker compose up` без override собирает и выполняет production-бандл Next.js, в котором hot reload не работает.
2. **Dev override трансформирует контейнеры в среду разработки**:
   - Наблюдение: `docker-compose.dev.yml` переопределяет команду на `npm run dev`, включает `WATCHPACK_POLLING=true`, монтирует `.:/app` и защищает `node_modules` и `.next` через анонимные тома.
   - Вывод: Мультифайловая команда `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build` является единственным штатным способом поднять проект в Docker с полноценным Hot Reload.
3. **Требования к среде хоста vs контейнера**:
   - Наблюдение: `GEMINI.md` гласит: *"For local development with Hot Reload, you MUST run the `web` container inside Docker... Do NOT run `npm run dev` locally on the host machine"*.
   - Вывод: Документация должна четко ставить разработку в Docker на первое место.
4. **Несинхронизированность README.md**:
   - Наблюдение: В строке 56 `README.md` Режим 2 назван *«PostgreSQL и worker в Docker с локальным Next.js»*, а команда с `docker-compose.dev.yml` вовсе не указана.
   - Вывод: `README.md` вводит пользователей и агентов в заблуждение, провоцируя запуск `npm run dev` на хосте либо запуск production-контейнеров без hot reload.
5. **Неполнота пошаговых инструкций в docs/deployment.md**:
   - Наблюдение: В строке 72 оператору предложено выполнить миграции на хосте, но без работающего контейнера `postgres` команда `npm run prisma:migrate` завершится ошибкой подключения `P1001: Can't reach database server`.
   - Вывод: Инструкция должна явно указывать запуск `docker compose up -d postgres` перед накатом миграций.

---

## 3. Caveats (Ограничения и допущения)
- Мы не изменяем исходные файлы проекта (`docs/deployment.md`, `README.md`) самостоятельно в этой сессии, так как работаем в строгом режиме `read-only explorer`. Все изменения представлены в виде готового плана и точных текстовых замен для исполнителя/редактора.
- Предполагается, что оператор использует Docker Compose V2 (`docker compose` через пробел, а не устаревший дефисный `docker-compose`), что соответствует всем текущим конфигурациям в репозитории.

---

## 4. Conclusion (Итоговый план изменений)

### A. Необходимые изменения в `README.md`

1. **Обновить дату сверки (строка 5):**
   - Было: `Документация сверена с исходным кодом **17 сентября 2026 года**.`
   - Стало: `Документация сверена с исходным кодом **20 сентября 2026 года**.`

2. **Переработать раздел «Быстрый старт» (строки 22–53):**
   - Название: `## Быстрый старт (рекомендуемый: всё в Docker с Hot Reload)`
   - Описать рекомендуемый процесс:
     1. Зависимости и конфигурация:
        ```bash
        npm ci
        cp .env.example .env
        ```
     2. Авторизация в Telegram (интерактивно на хосте):
        ```bash
        npm run auth
        ```
     3. Запуск PostgreSQL и накат миграций:
        ```bash
        docker compose up -d postgres
        npm run prisma:generate
        npm run prisma:migrate
        ```
     4. Запуск всех сервисов в dev-режиме:
        ```bash
        docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
        ```
     5. Открыть [http://localhost:4000](http://localhost:4000).
   - Указать примечание:
     *«Next.js и worker работают внутри контейнеров с монтированием директории проекта и переменной `WATCHPACK_POLLING=true`, что обеспечивает мгновенный Hot Reload. Запуск `npm run dev` на хосте не рекомендуется. При необходимости изолированной отладки процессов на хосте доступен альтернативный режим через `npm run dev:all` (см. [docs/deployment.md](docs/deployment.md)).»*

3. **Исправить раздел «Docker и развёртывание» (строки 54–68):**
   - Заменить устаревшую строку 56:
     - Было: `[Инструкция развёртывания](docs/deployment.md) описывает три режима: всё на хосте, PostgreSQL и worker в Docker с локальным Next.js, полный Compose. Миграции не запускаются автоматически при старте контейнеров.`
     - Стало: `[Инструкция развёртывания](docs/deployment.md) описывает три режима: локальная разработка в Docker с Hot Reload (`docker-compose.dev.yml`), запуск на хосте (`dev:all`) и production-развёртывание (полный Compose). Миграции не запускаются автоматически при старте контейнеров.`
   - Добавить явное разделение команд:
     - Для разработки: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`
     - Для production:
       ```bash
       docker compose up -d postgres
       docker compose build web worker
       docker compose run --rm --no-deps worker npm run prisma:migrate
       docker compose up -d web worker
       ```

---

### B. Необходимые изменения в `docs/deployment.md`

1. **Обновить дату сверки (строка 3):**
   - Заменить `17 сентября 2026 года` на `20 сентября 2026 года`.

2. **Повысить статус и детализацию Режима 2 (строки 70–79):**
   - Сделать его первым рекомендуемым разделом после переменных окружения или переименовать:
     `## Режим 1: Локальная разработка в Docker (рекомендуемый, Hot Reload)`
   - Привести исчерпывающую последовательность команд:
     ```bash
     # 1. Запуск базы данных
     docker compose up -d postgres

     # 2. Генерация клиента и применение миграций
     npm run prisma:generate
     npm run prisma:migrate

     # 3. Интерактивная авторизация Telegram (если сессия ещё не создана)
     npm run auth

     # 4. Запуск приложения и воркера с Hot Reload
     docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
     ```
   - Добавить техническое пояснение:
     *«Файл `docker-compose.dev.yml` подключает bind-mount текущего каталога в `/app`, исключает конфликты хостовых артефактов через анонимные тома `/app/node_modules` и `/app/.next`, переопределяет команду web на `npm run dev` (`next dev -p 4000`) и задаёт `WATCHPACK_POLLING=true` для гарантированного срабатывания Hot Reload в среде Docker на любых ОС. Worker запускается в режиме автоперезапуска `tsx watch`. Не запускайте `npm run dev` на хосте.»*

3. **Скорректировать раздел запуска на хосте (строки 53–69):**
   - Переименовать в `## Режим 2: Запуск web и worker на хосте (альтернативный/отладочный)`.
   - Явно пометить его как запасной вариант для отладки отдельных компонентов без Docker.

4. **Уточнить раздел полного Compose (Production):**
   - Оставить как `## Режим 3: Production-развёртывание (полный Compose)`.
   - Чётко зафиксировать, что в production код не монтируется через volume, а компилируется внутрь образа (`npm run build`), сервер запускается через `npm start` без hot reload.

---

## 5. Verification Method (Метод проверки)

Для независимой проверки выводов отчёта:
1. **Проверка конфигурации Compose:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml config
   ```
   Проверить в выводе, что сервис `web` получил команду `npm run dev`, переменную `WATCHPACK_POLLING: "true"`, тома `.:/app`, `/app/node_modules`, `/app/.next`, а сервис `worker` — команду `npx tsx watch src/worker/index.ts`.
2. **Проверка скриптов в `package.json`:**
   ```bash
   npm run dev -- --help
   ```
   Убедиться, что скрипт dev запускает `next dev -p 4000`.
3. **Поиск устаревших упоминаний в репозитории:**
   ```bash
   git grep -n "PostgreSQL и worker в Docker с локальным Next.js"
   ```
   Подтверждает наличие устаревшей строки в `README.md:56`.
4. **Проверка соответствия правилам проекта:**
   Сверить рекомендации с `c:\TgMon\GEMINI.md` (строка 17) и `c:\TgMon\AGENTS.md` (строка 23).
