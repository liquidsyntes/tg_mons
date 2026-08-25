# Промпт для реализации метрики EP (Effective Point)

Скопируй блок ниже целиком в AI-ассистента (Cursor/Claude/GPT) для генерации кода.

---

## ЗАДАЧА

Реализуй модуль расчёта метрики **EP (Effective Point)** — комплексного индекса эффективности Telegram-канала, который учитывает прирост подписчиков, охват (просмотры) и вовлечённость (ERR), нормализованных относительно нишевой выборки каналов, чтобы каналы разного масштаба (500 подписчиков и 5000 подписчиков) были корректно сопоставимы.

Стек: TypeScript/Node.js. Данные приходят из базы (Postgres/Prisma) со снепшотами каналов за периоды.

## ВХОДНЫЕ ДАННЫЕ

Для каждого канала на момент расчёта нужны:

```typescript
interface ChannelSnapshot {
  channelId: string;
  niche: string;              // категория/ниша канала
  subscribers: number;        // текущее кол-во подписчиков
  newSubs24h: number;
  newSubs7d: number;
  newSubs30d: number;
  postViews: number[];        // просмотры последних 10-20 постов
  postReactions: number[];    // реакции на те же посты (по индексу)
  postComments: number[];
  postForwards: number[];
}
```

## ШАГ 1. Growth Rate (темп прироста)

Считать относительно базы, не абсолютные числа:

```
GR_24h = newSubs24h / subscribers * 100
GR_7d  = (newSubs7d / subscribers * 100) / 7   // дневная ставка
GR_30d = (newSubs30d / subscribers * 100) / 30 // дневная ставка
```

## ШАГ 2. Composite Growth Score (CEI)

```
Score = 0.2 * GR_24h + 0.3 * GR_7d + 0.5 * GR_30d

Confidence = 0.5 + 0.5 * ( ln(subscribers + 1) / ln(maxSubscribersInNiche + 1) )

CEI = Score * Confidence
```

`maxSubscribersInNiche` — максимум подписчиков среди всех каналов той же ниши в выборке.

## ШАГ 3. View Rate (охват)

Использовать МЕДИАНУ, а не среднее — чтобы один виральный пост не искажал метрику:

```
medianViews = median(postViews)
VR = medianViews / subscribers * 100
```

## ШАГ 4. ERR (вовлечённость по охвату)

```
totalEngagement[i] = postReactions[i] + postComments[i] + postForwards[i]
avgEngagement = mean(totalEngagement)
avgViews = mean(postViews)
ERR = avgEngagement / avgViews * 100
```

## ШАГ 5. Z-нормализация внутри ниши

Для каждой ниши считать распределение CEI, VR, ERR по всем каналам в этой нише (µ — среднее, σ — стандартное отклонение):

```
Z_growth = (CEI - mean(CEI_niche)) / std(CEI_niche)
Z_vr     = (VR - mean(VR_niche)) / std(VR_niche)
Z_err    = (ERR - mean(ERR_niche)) / std(ERR_niche)
```

Обработать edge case: если σ = 0 (все каналы в нише одинаковые или выборка из 1 канала) — Z = 0.

## ШАГ 6. Composite Score

Веса по умолчанию (сделать настраиваемыми через конфиг):

```
w_growth = 0.45
w_vr     = 0.30
w_err    = 0.25

CompositeScore = w_growth * Z_growth + w_vr * Z_vr + w_err * Z_err
```

## ШАГ 7. Финальный EP (Effective Point)

Перевести в шкалу 0-100 через сигмоиду, затем применить ту же confidence-поправку на размер канала:

```
sigmoidScore = 100 / (1 + exp(-CompositeScore))

EP = sigmoidScore * (0.5 + 0.5 * ( ln(subscribers + 1) / ln(maxSubscribersInNiche + 1) ))
```

Результат — число от 0 до 100. 50 = средняя эффективность в нише, 70+ = канал заметно опережает конкурентов той же ниши по совокупности роста, охвата и вовлечённости, ниже 30 = слабый/подозрительный (возможна накрутка подписчиков без реального охвата).

## ТРЕБОВАНИЯ К РЕАЛИЗАЦИИ

1. Функция `calculateEP(channel: ChannelSnapshot, nicheStats: NicheStats): number` — чистая, без побочных эффектов.
2. Отдельная функция `computeNicheStats(channels: ChannelSnapshot[]): Map<string, NicheStats>` — считает µ и σ по CEI/VR/ERR для каждой ниши перед основным расчётом.
3. Веса (`w_growth`, `w_vr`, `w_err`) и веса периодов (0.2/0.3/0.5) вынести в конфиг-объект с дефолтными значениями.
4. Покрыть unit-тестами кейсы: канал 5000 подписчиков / +50 в сутки vs канал 500 подписчиков / +40 в сутки — второй должен получить более высокий EP при равных VR/ERR.
5. Обработать деление на ноль (subscribers = 0, avgViews = 0).
6. Вернуть не только итоговый EP, но и промежуточные компоненты (`CEI`, `VR`, `ERR`, `Z_growth`, `Z_vr`, `Z_err`) для дебага и отображения в дашборде.

## ФОРМАТ ВЫВОДА

```typescript
interface EPResult {
  channelId: string;
  EP: number;           // 0-100
  breakdown: {
    CEI: number;
    VR: number;
    ERR: number;
    Z_growth: number;
    Z_vr: number;
    Z_err: number;
  };
}
```
