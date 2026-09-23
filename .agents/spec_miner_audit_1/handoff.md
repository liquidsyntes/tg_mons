# Результаты спецификационного аудита (R2: Database, Analytics Formulas, ADR, Security/Environment)

**Автор:** `spec_miner_audit_1`  
**Дата:** 2026-09-20  
**Рабочая директория:** `c:\TgMon\.agents\spec_miner_audit_1`  
**Проект:** `c:\TgMon`  

---

## 1. Features Discovered

| # | Категория | Фича / Модуль | Описание | Входные параметры | Выходные данные | Поведение при ошибках / Недостатке данных | Источник в коде |
|---|-----------|---------------|----------|-------------------|-----------------|-------------------------------------------|-----------------|
| 1 | Database | Prisma Schema & Extensions | PostgreSQL схема с расширением `pg_trgm` для полнотекстового поиска триграмм, 15 моделей, 1 enum | `prisma/schema.prisma` | DDL / Клиент Prisma | Ошибки миграций/генерации при блокировке процессов node | `prisma/schema.prisma` |
| 2 | Analytics / Fraud | Views-to-Subs Ratio | Проверка соотношения средних просмотров к числу подписчиков (5% - 150%) | `posts: {views}[], currentMembers: number` | `FraudSignalResult { flag, ratio, reason }` | При `currentMembers <= 0` или валидных постов `< 5` возвращает `flag: false` | `src/lib/fraudDetector.ts:50-87` |
| 3 | Analytics / Fraud | Growth Smoothness | Анализ коэффициента вариации (CV) суточных приростов подписчиков (линейная накрутка) | `metrics: {date, followers}[]` | `GrowthSmoothnessResult { flag, cv, reason }` | При `< 14` записей или `avgDelta <= 0` возвращает `flag: false` | `src/lib/fraudDetector.ts:113-149` |
| 4 | Analytics / Fraud | Uncorrelated Spikes | Детекция резких скачков подписчиков ($> \max(3\mu, 50, 0.005 S_{\max})$) без постов и упоминаний | `metrics[], postsDates[], mentionsDates[]` | `UncorrelatedSpikesResult { flag, spikesCount, dates, reason }` | При `< 2` записей или отсутствии положительных приростов `flag: false` | `src/lib/fraudDetector.ts:196-271` |
| 5 | Analytics / Fraud | Uniform ERR (Reaction Ratio) | Детекция шаблонных накруток реакций ботами по коэффициенту вариации ERR ($CV < 0.1$) | `channel` с постами или массив постов | `UniformReactionRatioResult { flag, cv, reason, avgErr, postsCount, signal }` | При `< 10` валидных постов или `avgErr <= 0` возвращает `flag: false` | `src/lib/fraudDetector.ts:600-700` |
| 6 | Analytics / Fraud | Unified Fraud Score | Консолидация 4 эвристик в балл 0..100 (каждый сработавший флаг +25) | `channel` (сырые данные, `fraudSignals` из БД или симуляция) | `FraudAuditResult { fraudScore, signals, details }` | При отсутствии данных возвращает `fraudScore: 0`, `signals: []` | `src/lib/fraudDetector.ts:744-1061` |
| 7 | Analytics / Citation | Citation Index (CI) | Логарифмический индекс цитирования: $\sum \text{count}_i \cdot \log_{10}(\text{subscribers}_i)$ за 30 дней | `channel` / массив упоминаний `CitationMention[]`, дата `now` | Число $\ge 0$, округлённое до 2 знаков (`number`) | При 0 упоминаний, $S \le 1$ или ошибке БД возвращает `0` | `src/lib/citationIndex.ts:189-322` |
| 8 | Analytics / Citation | Low Citation Growth | Сигнал накрутки при росте подписчиков за 30 дней $> 5\%$ и $CI \le 1.0$ (не входит в `fraudScore`) | Рост (%) и CI или объект канала | `LowCitationGrowthResult { flag, citationIndex, growthRate, growthPercent, value, reason }` | Не выбрасывает исключений, валидирует типы через fallback helper | `src/lib/fraudDetector.ts:352-442` |
| 9 | Analytics / Quality | Effective Point (EP) | Нишевый z-нормализованный рейтинг канала на основе CEI, VR, ERR и логарифмического confidence | `ChannelSnapshot`, `NicheStats` | `EPResult { channelId, EP, breakdown }` | `confidence = 1` при пустой нише, clamp $[0, 100]$ | `src/lib/ep.ts:179-206` |
| 10 | Analytics / Quality | Content Score | Оценка качества контента (0..100): ERR (30) + Consistency (20) + Growth (20) + Diversity (15) + Originality (15) | `trueErr, postsPerDay, growthPercent, posts` | `ScoreBreakdown { errScore, consistencyScore, ..., total, grade, recommendation }` | Дефолтные баллы при отсутствии постов (diversity 10, originality 10) | `src/lib/scoring.ts:29-126` |
| 11 | Analytics / Ads | Ad Load & Pricing | Рекламная нагрузка по `Post.isAd` и оценка стоимости поста по CPM ниши и кривой охвата (1, 12, 24, 48ч) | `channelId` | `{ estimatedPricePerPost, cpm, confidence, averageAdReach, averageReachCurve }` | При отсутствии рекламы возвращает `null` для цены и охвата, `confidence: low` | `src/lib/pricing.ts`, `src/lib/metrics/adShare.ts` |
| 12 | Analytics / Retention | Content LTV | Кривая накопления просмотров по часам (1..72) на базе `PostSnapshot` за 14 дней | `channelId` через `/api/channels/:id/ltv` | `{ ltv: { hour, percent }[] }` | При отсутствии постов со снимком $\le 6$ч возвращает `{ ltv: [] }` | `src/app/api/channels/[id]/ltv/route.ts` |
| 13 | Analytics / Activity | Best Time Recommendation | Определение оптимальных слотов постинга (день/час) по конкурентам: $VR/\max(VR) - 0.5 \cdot \text{count}/\max(\text{count})$ | `isMine: false, isActive: true` каналы за 30 дней | `{ bestDay, bestHour, score, avgViews, avgVr, postCount, heatmap }` | Возвращает `null` при отсутствии активных конкурентов | `src/lib/metrics/queries.ts:501-618` |

---

## 2. Edge Cases

| # | Фича / Модуль | Входные данные (Edge Case) | Наблюдаемое и подтверждённое поведение кода |
|---|---------------|----------------------------|---------------------------------------------|
| 1 | `checkGrowthSmoothness` | `metrics.length < 14` | Возвращает `{ flag: false, cv: 0, reason: "Недостаточно данных для анализа (менее 14 дней)" }` (`fraudDetector.ts:116-118`). |
| 2 | `checkGrowthSmoothness` | Средний суточный прирост $\le 0$ (канал падает или стагнирует) | Возвращает `{ flag: false, cv: 0, reason: "Нет монотонного роста (средний прирост <= 0)" }` (`fraudDetector.ts:132-134`). |
| 3 | `checkViewsToSubsRatio` | `currentMembers <= 0` | Возвращает `{ flag: false, ratio: 0, reason: "Недостаточно подписчиков для анализа" }` (`fraudDetector.ts:55-57`). |
| 4 | `checkViewsToSubsRatio` | Валидных постов с `views > 0` меньше 5 (`validPosts.length < 5`) | Возвращает `{ flag: false, ratio, reason: "Недостаточно постов для достоверного анализа" }` (`fraudDetector.ts:72-74`). |
| 5 | `checkViewsToSubsRatio` | Граничные значения `ratio === 0.05` или `ratio === 1.50` | `flag: false`, условие строгое: `ratio < 0.05` или `ratio > 1.5` (`fraudDetector.ts:77-84`). |
| 6 | `checkUncorrelatedSpikes` | `metrics.length < 2` или нет положительных дельт | Возвращает `flag: false` (`fraudDetector.ts:201-203, 217-219`). |
| 7 | `checkUncorrelatedSpikes` | Дельта превышает порог $T$, но в день скачка или за день до него был пост или упоминание | Скачок считается обоснованным (`hasPost \|\| hasMention`), в `anomalousSpikes` не попадает, `flag: false` (`fraudDetector.ts:253-261`). |
| 8 | `checkUniformReactionRatio` | Валидных постов с известным ERR меньше 10 (`recentErrs.length < 10`) | Возвращает `{ flag: false, cv: 0, reason: "Недостаточно данных для анализа (менее 10 постов)", postsCount }` (`fraudDetector.ts:649-656`). |
| 9 | `checkUniformReactionRatio` | Все посты имеют 0 реакций/комментариев/репостов (`avgErr <= 0`) | Возвращает `{ flag: false, cv: 0, reason: "Нулевой или отрицательный средний ERR", avgErr: 0 }` (`fraudDetector.ts:661-669`). |
| 10 | `calculateCitationIndex` | Упоминающий канал имеет $\le 1$ подписчика (`subs <= 1`) | Вес логарифма отсекается: `subs <= 1` игнорируется (`Math.log10(1) = 0`, $\le 0$ не добавляется) (`citationIndex.ts:309`). |
| 11 | `calculateCitationIndex` | Самоцитирование (`sourceChannelId === selfId`) | Исключается из расчёта как в pure-функции, так и в DB helper (`citationIndex.ts:260-270, 367, 539`). |
| 12 | `calculateCitationIndex` | Дата упоминания старше 30 дней или в будущем ($> 24$ч) | Исключается по условию временного окна `diff > MS_30D \|\| diff < -24 * 3600 * 1000` (`citationIndex.ts:290-292`). |
| 13 | `runFraudAudit` | Канал имеет сохранённый в БД `FraudSignal` за последние 30 дней | Сохранённый сигнал перекрывает пересчёт по сырым данным и безусловно выставляет флаг +25 баллов (`fraudDetector.ts:795, 845, 902, 974`). |
| 14 | `runFraudAudit` | Несколько сработавших сигналов одного типа | Балл начисляется однократно за уникальный тип (максимум 25 баллов на тип, итого 0, 25, 50, 75 или 100) (`fraudDetector.ts:1009-1049`). |
| 15 | `RiskBadge` | `score` равен `null`, `undefined` или `0` | Парсится как `0`, класс `bg-emerald-500/15 text-emerald-400 border-emerald-500/30`, текст "Risk of Artificial Traffic: 0%" (`RiskBadge.tsx:22, 30, 53`). |
| 16 | `calculateContentScore` | Нет постов в канале | `engagementScore = 10`, `originalityScore = 10`, `growthScore = 0`, `consistencyScore = 5`, `errScore = 5`, итого 30 баллов (Grade D) (`scoring.ts:43, 51, 70, 82`). |
| 17 | `computeAvgViews24h` | Нет постов в окне 24..48ч, но есть посты в окне 24ч..7д | Окно расширяется до 7д..24ч, возвращает среднее по расширенному окну (`calculate.ts:92-95`). |
| 18 | `estimateAdPrice` | Менее 3 рекламных постов (`adPosts.length < 3`) | `confidence: 'low'`, при 0 постов цена `null` (`pricing.ts:37-41`). |

---

## 3. Ответы на контрольные вопросы миссии (с верифицированными фактами)

### Вопрос 1: Документация БД (Database Documentation Audit)
> *В документации базы данных: соответствует ли каждая задокументированная модель, поле, enum, связь и индекс схеме `prisma/schema.prisma`? Есть ли пропущенные или устаревшие поля?*

1. **Файл `docs/database.md` в репозитории физически отсутствует.**  
   Вся документация моделей данных сосредоточена в файле `docs/architecture.md` (раздел `## Модель данных`, строки 35-56) и кратко упомянута в `docs/codebase.md` (строка 84).
2. **Сверка моделей и таблиц:**  
   В `prisma/schema.prisma` определено **15 моделей** и **1 enum**:
   - `Channel` (`channels`)
   - `AiReport` (`ai_reports`)
   - `Snapshot` (`snapshots`)
   - `Post` (`posts`)
   - `PostSnapshot` (`post_snapshots`)
   - `Mention` (`mentions`)
   - `SyncJob` (`sync_jobs`)
   - `Event` (`events`)
   - `EventMention` (`event_mentions`)
   - `ChannelMetricDaily` (`channel_metrics_daily`)
   - `AudienceDemographics` (`audience_demographics`)
   - `SystemSetting` (`system_settings`)
   - `AlertRule` (`alert_rules`)
   - `FraudSignal` (`fraud_signals`)
   - `PostViewSnapshot` (`post_view_snapshots`)
   - `enum SyncStatus { RUNNING, COMPLETED, PARTIAL, FAILED }`
   
   В таблице `docs/architecture.md:37-53` перечислены все 15 моделей (с объединением `Event, EventMention` в одну строку). Названия моделей и их сопоставление с таблицами PostgreSQL (`@@map`) совпадают на 100%.
3. **Пропуски и расхождения в текущей документации моделей:**
   - **Enum `SyncStatus`**: полностью отсутствует в таблице моделей `docs/architecture.md`, хотя `SyncJob.status` использует этот enum со значениями `RUNNING`, `COMPLETED`, `PARTIAL`, `FAILED`.
   - **Детализация полей**: таблица в `docs/architecture.md` носит обзорный характер (на уровне назначения таблицы) и не документирует типы полей, ограничения nullability и дефолтные значения. В частности, не отражены:
     - `Channel.consecutiveErrors` (Int @default(0)), `Channel.lastMessageId` (BigInt?), `Channel.isFavorite` (Boolean @default(false));
     - `Post.subscribersAtPublish` (Int?), `Post.isAd` (Boolean @default(false)), `Post.groupedId` (BigInt?);
     - `Event.prices` (Json?), `Event.timeStr` (String?);
     - `SystemSetting.aiProvider`, `aiModel`, `aiToken`, `digestEnabled`, `digestHour`, `lastDigestAt`;
     - `AlertRule.metric` (допустимые строковые значения: `followers`, `delta24h`, `delta7d`, `er7d`, `err7d`, `vr7d`, `avgViews7d`, `posts7d`, `contentScore`), `operator` (`lt`, `gt`), `threshold`.
   - **Индексы и ограничения**:
     - В `docs/architecture.md` отмечены только unique `(channelId, messageId)` для `Post`, unique `(postId, hoursAfterPost)` для `PostViewSnapshot`, unique `(channelId, date)` для `ChannelMetricDaily`, а также GIN-индекс `pg_trgm` для `Post.text`.
     - **Пропущены индексы схемы:**
       - `Channel`: `@unique username`, `@unique tgId`;
       - `Snapshot`: `@@index([channelId, collectedAt])`;
       - `Post`: `@@index([channelId, groupedId])`, `@@index([channelId, publishedAt])`;
       - `PostSnapshot`: `@@index([postId, collectedAt])`;
       - `Mention`: `@@index([sourceChannelId])`, `@@index([targetUsername])`;
       - `EventMention`: `@@unique([eventId, postId])`, `@@index([eventId])`, `@@index([postId])`;
       - `ChannelMetricDaily`: `@@index([date])`;
       - `AudienceDemographics`: `@@index([channelId, capturedAt])`;
       - `AiReport`: `@@index([channelId, createdAt])`;
       - `AlertRule`: `@@index([channelId])`;
       - `FraudSignal`: `@@index([channelId, detectedAt])`;
       - `PostViewSnapshot`: `@@index([postId])`.
   - **Связи и каскады:** Все foreign key связи в `prisma/schema.prisma` используют `onDelete: Cascade` (удаление канала каскадно удаляет snapshots, posts, mentions, metrics, demographics, aiReports, alertRules, fraudSignals). В `docs/architecture.md:56` упомянуто общее правило "физическое удаление использует каскады связей Prisma", но без перечисления связей.
   - **Миграции:** `docs/architecture.md:54` корректно фиксирует последнюю миграцию `20260916213000_add_demographics_country` и наличие расширения `pg_trgm`.

---

### Вопрос 2: Формулы аналитики (Analytics Formulas Audit)
> *В формулах аналитики: точно ли формулы в `docs/analytics-formulas.md` отражают формулы, реализованные в коде (гладкий рост, нескоррелированные скачки, индекс цитирования, равномерный ERR CV, единый fraudScore)? Точны ли пороги и граничные случаи?*

**Вердикт: Формулы в `docs/analytics-formulas.md` отражают код с высочайшей фактологической и математической точностью.**  
Ниже приведено построчное сопоставление по каждой запрашиваемой формуле:

1. **Гладкость роста (`checkGrowthSmoothness`):**
   - Документ (`docs/analytics-formulas.md:173-178`):
     $$\Delta_i = S_i - S_{i-1},\quad \mu = \frac{\sum \Delta_i}{N-1},\quad \sigma = \sqrt{\frac{\sum (\Delta_i - \mu)^2}{N-1}},\quad CV = \sigma / \mu$$
     Пороги: $N \ge 14$, $\mu > 0$, флаг при $CV < 0.1$. В документе явно отмечено, что знаменатель $N-1$ равен числу дельт (совокупность, а не несмещенная оценка выборки).
   - Код (`src/lib/fraudDetector.ts:113-149`):
     `metrics.length < 14` -> отсечение; `deltas.length === sortedMetrics.length - 1`; `avgDelta = sum / deltas.length`; `avgDelta <= 0` -> отсечение; `stdDev = Math.sqrt(sumSq / deltas.length)`; `cv = stdDev / avgDelta`; `cv < 0.1` -> `flag: true`.
     *Соответствие 100%.*

2. **Нескоррелированные скачки (`checkUncorrelatedSpikes`):**
   - Документ (`docs/analytics-formulas.md:183-190`):
     Требуется $N \ge 2$, среднее $\mu$ считается по **всем** дельтам (включая отрицательные), динамический порог:
     $$T = \max(3\mu, 50, 0.005 S_{\max})$$
     Проверка события в окне $[t-1, t]$ по локальному времени суток процесса.
   - Код (`src/lib/fraudDetector.ts:196-271`):
     `avgDelta = deltas.reduce((s,d) => s + d.delta, 0) / deltas.length` (все дельты!); `maxFollowers = Math.max(...)`; `threshold = Math.max(avgDelta * 3, 50, maxFollowers * 0.005)`; `spikes = positiveDeltas.filter(d => d.delta > threshold)`; проверка `hasEventInWindow` с `setHours(0,0,0,0)` на сегодня и вчера (`targetTime` и `prevTime`).
     *Соответствие 100%.*

3. **Равномерность ERR (`checkUniformReactionRatio`):**
   - Документ (`docs/analytics-formulas.md:191-194`):
     Берётся до 20 последних валидных ERR (при `views > 0`). Требуется $\ge 10$ постов, среднее $\overline{ERR} > 0$. $CV = \sigma / \overline{ERR}$. Порог $CV < 0.1$.
   - Код (`src/lib/fraudDetector.ts:600-700`):
     `recentErrs = validErrs.slice(0, 20)`; `recentErrs.length < 10` -> `flag: false`; `avgErr <= 0` -> `flag: false`; `variance = sumSquaredDiffs / recentErrs.length`; `stdDev = Math.sqrt(variance)`; `cv = stdDev / avgErr`; `cv < 0.1` -> `flag: true`.
     *Соответствие 100%.*

4. **Единый `fraudScore` (`runFraudAudit`):**
   - Документ (`docs/analytics-formulas.md:195-202`):
     $$fraudScore = 25 \sum_{j=1}^{4} flag_j \in \{0, 25, 50, 75, 100\}$$
     Приоритет сохраненных в БД сигналов за 30 дней перед живым расчетом. Повторные сигналы одного типа не добавляют баллы сверх 25. RiskBadge: 0 — зелёный, 1–49 — янтарный, $\ge 50$ — розовый.
   - Код (`src/lib/fraudDetector.ts:744-1061`, `src/components/RiskBadge.tsx:22-30`):
     4 проверки по 25 баллов; чтение `fraudSignals` с приоритетом над расчетом; `safeScore = isFinite(parsedScore) ? clamp(0, 100, round(score)) : 0`; `isHighRisk = safeScore >= 50` (rose), `isMediumRisk = safeScore > 0 && safeScore < 50` (amber), иначе emerald.
     *Соответствие 100%.*

5. **Индекс цитирования (`calculateCitationIndex` и `checkLowCitationGrowth`):**
   - Документ (`docs/analytics-formulas.md:203-212`):
     $$CI = \text{round}_2\left(\sum_i \text{count}_i \log_{10}(\text{subscribers}_i)\right)$$
     Входные упоминания за 30 дней; исключение самоцитирования; вес подписчиков $\le 1$ дает 0; `checkLowCitationGrowth` срабатывает при росте $> 5\%$ и $CI \le 1.0$, используется отдельно и **не входит** в `fraudScore`.
   - Код (`src/lib/citationIndex.ts:189-322`, `src/lib/fraudDetector.ts:352-442`):
     `Math.log10(subs)` для `subs > 1`; `Number(totalScore.toFixed(2))`; фильтрация по окну 30 дней с допуском 24ч вперед; исключение `selfId`; `isHighGrowth = growthRate > minGrowth` (5) и `isNearZeroCitation = citationIndex <= maxCitationIndex` (1.0).
     *Соответствие 100%.*

6. **Остальные формулы документа:**
   - True ERR в materialized: $\frac{\sum ERR_d \cdot \text{postsCount}_d}{\sum \text{postsCount}_d}$ (`aggregate.ts:37`);
   - True ERR в fallback: $100 \frac{\sum E_i}{\sum V_i}$ за период $[7d, 1d)$ (`aggregate.ts:233`);
   - EP, CEI, Sigmoid, Z-score (`ep.ts:98-111, 179-197`);
   - Content Score (ERR, Consistency, Growth, Diversity, Originality) (`scoring.ts:29-126`);
   - Pricing: CPM по нишам и средняя кривая охвата (`pricing.ts:4-15, 84-97`);
   - Content LTV: 1..72 часа, требование снимка $\le 6$ч (`ltv/route.ts:50-93`);
   - Best Time: $VR/\max(VR) - 0.5 \cdot \text{count}/\max(\text{count})$ (`queries.ts:589`).
   Все формулы, константы, граничные условия и веса совпадают на 100%.

---

### Вопрос 3: Аудит ADR (Architecture Decision Records)
> *В ADR: согласованы ли ADR с кодовой базой и актуальны ли они?*

1. **Состав директории `docs/adr/`:**  
   В директории присутствует единственный документ: `docs/adr/0001-anti-fraud-detection-architecture.md`.
2. **Анализ ADR 0001:**
   - **Статус и область:** Документ полностью соответствует коду (`src/lib/fraudDetector.ts`, `src/lib/citationIndex.ts`, `src/worker/collector.ts`, `src/worker/persister.ts`, `src/components/RiskBadge.tsx`).
   - **Диаграмма и архитектурное решение:** Отражает реальный конвейер сбора: сбор данных -> материализация -> вызов 4 чистых детекторов -> сохранение в таблицу `fraud_signals` -> чтение query layer за 30 дней -> `runFraudAudit` -> `RiskBadge`.
   - **Пороговые значения и компромиссы:** Все пороговые значения в таблице ADR 0001 совпадают с кодовыми константами. Зафиксировано разделение: `checkLowCitationGrowth` не входит в `fraudScore` и выводится отдельно.
   - **Тестовое покрытие:** Все 3 тестовых файла, указанных в ADR (`src/lib/__tests__/fraudDetector.test.ts`, `src/lib/__tests__/citationIndex.test.ts`, `src/components/__tests__/RiskBadge.test.ts`), существуют и успешно проходят (105 тестов из 105 завершаются со статусом PASS).
3. **Что требует обновления в ADR 0001:**
   - Строка 3: обновить дату сверки с `17 сентября 2026 года` на `20 сентября 2026 года`.

---

### Вопрос 4: Безопасность и переменные окружения (.env.example, security docs)
> *Любая документация по безопасности и окружению (например, docs/security.md, .env.example). Что именно устарело или расходится?*

1. **Файл `docs/security.md` отсутствует.**  
   Вопросы безопасности распределены по нескольким файлам:
   - `docs/overview.md:56` (отсутствие аутентификации пользователей, подстановка токена в middleware, возврат токена AI в настройках);
   - `docs/api-reference.md:11` (поведение `middleware.ts` по инъекции Bearer `COLLECT_API_TOKEN` для мутирующих запросов);
   - `docs/architecture.md:56` (открытое хранение `SystemSetting.aiToken`);
   - `docs/deployment.md:28-50` (таблица переменных окружения и изоляция портов).
2. **Фактические расхождения в `.env.example`:**
   - **Устаревшие комментарии про SQLite (строки 6-8):**
     ```env
     # По умолчанию: SQLite (не требует отдельного сервера БД)
     # Для локального запуска: file:./dev.db
     # Для Docker: file:./data/dev.db (с volume mount)
     ```
     В кодовой базе SQLite **не поддерживается в принципе** (в `prisma/schema.prisma` провайдер strictly `postgresql` и расширение `pg_trgm`). В `README.md:31` и `docs/deployment.md:8, 26` прямо указано, что комментарии про SQLite в `.env.example` устарели.
   - **Неиспользуемая переменная `MY_CHANNEL_USERNAME` (строка 37):**
     `MY_CHANNEL_USERNAME=""` присутствует в `.env.example`, но нигде в коде не читается (`docs/overview.md:60`, `docs/deployment.md:47`). Назначение «Моего канала» выполняется пользователем через UI/API.
   - **Переменные окружения, читаемые кодом, но отсутствующие в `.env.example`:**
     - `DEMOGRAPHICS_CRON` (читается в `src/worker/index.ts:11`, дефолт `'0 3 * * 0'`);
     - `CHANNEL_MAX_CONSECUTIVE_ERRORS` (читается в `src/worker/retry-policy.ts:53`, дефолт `10`);
     - `HEALTH_STUCK_THRESHOLD_MINUTES` (читается в `src/app/api/health/route.ts:21`, дефолт `'120'`);
     - `HEALTH_STALE_THRESHOLD_MINUTES` (читается в `src/app/api/health/route.ts:22`, дефолт `'720'`).

---

## 4. Пошаговый план необходимых правок (Actionable Modification Plan)

Для достижения 100% фактологической точности документации рекомендуются следующие конкретные изменения:

### План 1: Создание / актуализация документации базы данных
Существует два варианта решения:
- **Вариант А (рекомендуемый):** Создать специализированный файл `docs/database.md` с полной спецификацией PostgreSQL схемы (все 15 моделей, enum `SyncStatus`, типы полей, nullable/default, все индексы и каскады связей), сохранив русский язык и форматирование проекта, и добавить ссылку на него в `docs/architecture.md` и `docs/codebase.md`.
- **Вариант Б:** Расширить раздел `## Модель данных` в `docs/architecture.md`, включив в него enum `SyncStatus`, детали полей и полный список индексов.

Ниже приведён готовый проект содержания `docs/database.md`:
```markdown
# База данных и схема Prisma

Сверено с [schema.prisma](../prisma/schema.prisma) 20 сентября 2026 года. СУБД проекта — **PostgreSQL 15** с расширением `pg_trgm`. SQLite кодовой базой не поддерживается.

## Перечисления (Enums)

### `SyncStatus`
Статус фонового цикла сбора данных в модели `SyncJob`:
- `RUNNING` — сбор выполняется;
- `COMPLETED` — сбор успешно завершён для всех каналов;
- `PARTIAL` — завершён с ошибками части каналов;
- `FAILED` — критический сбой всего цикла сбора.

## Модели данных

| Модель | Таблица | Первичный ключ | Уникальные ключи / Индексы | Связи и каскады |
|---|---|---|---|---|
| `Channel` | `channels` | `id` (Int, autoincrement) | `@unique username`, `@unique tgId` | Связан с `snapshots`, `posts`, `mentions`, `channelMetricDailies`, `demographics`, `alertRules`, `fraudSignals`, `aiReports` (все `onDelete: Cascade`) |
| `Snapshot` | `snapshots` | `id` (Int, autoincrement) | `@@index([channelId, collectedAt])` | `channel` -> `Channel` (`Cascade`) |
| `Post` | `posts` | `id` (Int, autoincrement) | `@@unique([channelId, messageId])`, `@@index([channelId, groupedId])`, `@@index([channelId, publishedAt])`, GIN-индекс `text` (`gin_trgm_ops`) | `channel` -> `Channel` (`Cascade`), связаны `mentions`, `snapshots`, `viewSnapshots`, `eventMentions` |
| `PostSnapshot` | `post_snapshots` | `id` (Int, autoincrement) | `@@index([postId, collectedAt])` | `post` -> `Post` (`Cascade`) |
| `PostViewSnapshot`| `post_view_snapshots` | `id` (Int, autoincrement) | `@@unique([postId, hoursAfterPost])`, `@@index([postId])` | `post` -> `Post` (`Cascade`) |
| `Mention` | `mentions` | `id` (Int, autoincrement) | `@@index([sourceChannelId])`, `@@index([targetUsername])` | `sourcePost` -> `Post` (`Cascade`), `sourceChannel` -> `Channel` (`Cascade`). Внешнего ключа на целевой канал нет |
| `SyncJob` | `sync_jobs` | `id` (Int, autoincrement) | — | Хранит статус `SyncStatus`, счётчики и краткую ошибку |
| `ChannelMetricDaily` | `channel_metrics_daily` | `id` (Int, autoincrement) | `@@unique([channelId, date])`, `@@index([date])` | `channel` -> `Channel` (`Cascade`) |
| `AudienceDemographics` | `audience_demographics` | `id` (Int, autoincrement) | `@@index([channelId, capturedAt])` | `channel` -> `Channel` (`Cascade`). Поле `countryBreakdown` — nullable JSONB |
| `FraudSignal` | `fraud_signals` | `id` (Int, autoincrement) | `@@index([channelId, detectedAt])` | `channel` -> `Channel` (`Cascade`) |
| `AiReport` | `ai_reports` | `id` (Int, autoincrement) | `@@index([channelId, createdAt])` | `channel` -> `Channel?` (`Cascade`) |
| `Event` | `events` | `id` (Int, autoincrement) | — | Связан с `mentions` (`EventMention[]`) |
| `EventMention` | `event_mentions` | `id` (Int, autoincrement) | `@@unique([eventId, postId])`, `@@index([eventId])`, `@@index([postId])` | `event` -> `Event` (`Cascade`), `post` -> `Post` (`Cascade`) |
| `SystemSetting` | `system_settings` | `id` (String, default "global") | — | Хранит настройки AI и дайджеста |
| `AlertRule` | `alert_rules` | `id` (Int, autoincrement) | `@@index([channelId])` | `channel` -> `Channel?` (`Cascade`) |
```

### План 2: Правки в `docs/analytics-formulas.md`
1. Обновить дату актуализации в строке 3:
   - Было: `Сверено с исполняемым кодом 17 сентября 2026 года.`
   - Стало: `Сверено с исполняемым кодом 20 сентября 2026 года.`
2. Все формулы, константы и граничные условия уже на 100% совпадают с кодовой базой и не требуют математических изменений.

### План 3: Правки в `docs/adr/0001-anti-fraud-detection-architecture.md`
1. Обновить дату статуса в строке 3:
   - Было: `**Статус:** реализовано, описание актуализировано по коду 17 сентября 2026 года.`
   - Стало: `**Статус:** реализовано, описание актуализировано по коду 20 сентября 2026 года.`
2. Все описания сигналов, порогов и ограничений соответствуют кодовой базе и подтверждены успешным прохождением 105 unit-тестов.

### План 4: Очистка и актуализация `.env.example`
1. Удалить устаревшие строки 6-8 про SQLite:
   ```env
   # По умолчанию: SQLite (не требует отдельного сервера БД)
   # Для локального запуска: file:./dev.db
   # Для Docker: file:./data/dev.db (с volume mount)
   ```
   Заменить на:
   ```env
   # Database Connection URL (PostgreSQL 15+ c расширением pg_trgm)
   # Для хоста: postgresql://postgres:password@localhost:5432/tgmon?schema=public
   # Внутри Docker Compose: postgresql://postgres:password@postgres:5432/tgmon?schema=public
   ```
2. Пометить `MY_CHANNEL_USERNAME` как устаревшее / неиспользуемое кодом поле:
   ```env
   # Не используется кодом (канал назначается через UI или API):
   # MY_CHANNEL_USERNAME=""
   ```
3. Добавить в секцию опциональных настроек недостающие переменные с комментариями:
   ```env
   # Расписание сбора демографии (cron-формат, по умолчанию воскресенье 03:00 UTC)
   # DEMOGRAPHICS_CRON="0 3 * * 0"

   # Порог последовательных ошибок для автоотключения канала (по умолчанию 10)
   # CHANNEL_MAX_CONSECUTIVE_ERRORS=10

   # Пороги для проверки работоспособности (/api/health в минутах)
   # HEALTH_STUCK_THRESHOLD_MINUTES=120
   # HEALTH_STALE_THRESHOLD_MINUTES=720
   ```

### План 5: Создание документа по безопасности `docs/security.md` (Опционально)
Если требуется явный документ `docs/security.md`, он должен зафиксировать фактическую модель безопасности приложения:
- Аутентификация API через `COLLECT_API_TOKEN` и роль `src/middleware.ts` (автоинъекция заголовка Bearer для мутаций без проверки субъекта/Origin);
- Хранение сессий Telegram MTProto (`TG_SESSION`) и API ключей в переменных окружения;
- Открытое хранение `SystemSetting.aiToken` в БД и возвращение через `/api/settings`;
- Разграничение портов и сетевой периметр (порт 4000 для web, 5432 для БД).

---

## 5. Handoff Protocol

### 5.1. Observation
1. **Файлы схемы и миграций:**
   - `prisma/schema.prisma` содержит 15 моделей (`Channel`, `Snapshot`, `Post`, `PostSnapshot`, `PostViewSnapshot`, `Mention`, `SyncJob`, `ChannelMetricDaily`, `AudienceDemographics`, `AiReport`, `Event`, `EventMention`, `SystemSetting`, `AlertRule`, `FraudSignal`) и 1 enum (`SyncStatus`).
   - Папка `prisma/migrations/` содержит 14 миграций, последняя — `20260916213000_add_demographics_country`.
2. **Аналитические модули и формулы:**
   - `src/lib/fraudDetector.ts` реализует:
     - `checkViewsToSubsRatio` (строки 50-87): пороги 0.05 и 1.5, минимум 5 постов с `views > 0`.
     - `checkGrowthSmoothness` (строки 113-149): $N \ge 14$, $\mu > 0$, $CV < 0.1$, деление на $N-1$ дельт.
     - `checkUncorrelatedSpikes` (строки 196-271): $N \ge 2$, $T = \max(3\mu, 50, 0.005 S_{\max})$, окно 2 дня.
     - `checkUniformReactionRatio` (строки 600-700): окно до 20 постов, $N \ge 10$, $CV < 0.1$.
     - `runFraudAudit` (строки 744-1061): 4 флага $\times 25$ баллов $\in \{0, 25, 50, 75, 100\}$, приоритет сигналов БД.
     - `checkLowCitationGrowth` (строки 352-442): рост $> 5\%$, $CI \le 1.0$.
   - `src/lib/citationIndex.ts` (строки 189-322):
     $CI = \sum \text{count} \cdot \log_{10}(\text{subscribers})$, фильтр $S \le 1$, исключение `selfId`, окно 30 дней.
   - `src/components/RiskBadge.tsx` (строки 22-30):
     0 — зелёный, 1..49 — янтарный, $\ge 50$ — розовый.
3. **ADR:**
   - `docs/adr/0001-anti-fraud-detection-architecture.md` полностью соответствует реализации.
   - Команда `npm test -- src/lib/__tests__/fraudDetector.test.ts src/lib/__tests__/citationIndex.test.ts src/components/__tests__/RiskBadge.test.ts` выполнена: 3 тестовых файла, 105 тестов прошли успешно (exit code 0).
4. **Конфигурация окружения:**
   - `.env.example` содержит устаревшие комментарии про SQLite (строки 6-8) и неиспользуемую переменную `MY_CHANNEL_USERNAME` (строка 37).
   - В коде используются 4 переменные, не упомянутые в `.env.example`: `DEMOGRAPHICS_CRON`, `CHANNEL_MAX_CONSECUTIVE_ERRORS`, `HEALTH_STUCK_THRESHOLD_MINUTES`, `HEALTH_STALE_THRESHOLD_MINUTES`.

### 5.2. Logic Chain
1. Сопоставление каждого элемента схемы `prisma/schema.prisma` с файлами в `docs/` показало, что файла `docs/database.md` в репозитории нет, а существующая таблица в `docs/architecture.md` охватывает все 15 таблиц, но опускает enum `SyncStatus`, детальные описания полей и 12 вторичных индексов.
2. Математическое сопоставление формул в `docs/analytics-formulas.md` с кодом в `src/lib/fraudDetector.ts`, `src/lib/citationIndex.ts`, `src/lib/metrics/*.ts`, `src/lib/ep.ts`, `src/lib/scoring.ts`, `src/lib/pricing.ts` подтвердило абсолютную точность формул, весов, пороговых значений и граничных условий. Требуется только актуализация даты проверки на 20 сентября 2026 года.
3. Сопоставление `docs/adr/0001-anti-fraud-detection-architecture.md` с архитектурой worker и query layer показало полное совпадение принимаемых решений, констант и тестовой базы.
4. Анализ `process.env` во всех файлах `src/` выявил расхождения между реальными потребителями переменных и файлом `.env.example`.

### 5.3. Caveats
- Аудитор работал в строго read-only режиме: изменения в файлы репозитория не вносились.
- Файлы `docs/database.md` и `docs/security.md` упоминались в задании как потенциальные цели аудита; аудит достоверно подтвердил их отсутствие в репозитории на данный момент и подготовил полные спецификации для их создания при необходимости.

### 5.4. Conclusion
1. Документация формул аналитики (`docs/analytics-formulas.md`) и ADR антифрода (`docs/adr/0001-anti-fraud-detection-architecture.md`) находятся в превосходном состоянии, на 100% согласуются с кодом и требуют лишь обновления даты сверки.
2. В документации базы данных необходимо либо создать выделенный файл `docs/database.md` со структурой всех моделей, индексов и enum, либо дополнить раздел `## Модель данных` в `docs/architecture.md`.
3. Файл `.env.example` нуждается в очистке от вводящих в заблуждение упоминаний SQLite и добавлении 4 опциональных переменных окружения.

### 5.5. Verification Method
1. Запуск unit-тестов антифрода и метрик:
   ```bash
   npm test -- src/lib/__tests__/fraudDetector.test.ts src/lib/__tests__/citationIndex.test.ts src/components/__tests__/RiskBadge.test.ts
   ```
2. Проверка типов и линтинга:
   ```bash
   npx tsc --noEmit
   npm run lint
   ```
3. Проверка схемы Prisma:
   ```bash
   npx prisma validate
   ```
4. Инспекция файлов:
   - `prisma/schema.prisma` vs `docs/database.md` (или `docs/architecture.md`);
   - `src/lib/fraudDetector.ts` и `src/lib/citationIndex.ts` vs `docs/analytics-formulas.md`;
   - `.env.example` vs таблица в `docs/deployment.md`.
