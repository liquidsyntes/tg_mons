import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { getChannelDetailStats, parseStatsPeriod } from '@/lib/metrics';
import { callOpenRouter } from '@/lib/openrouter';
import { handleAiRouteError, saveAiReport } from '@/lib/ai-reports';

export const dynamic = 'force-dynamic';

function fmtNumber(val: number | null | undefined, suffix = ''): string {
  if (val === null || val === undefined || Number.isNaN(val)) return 'нет данных';
  return `${val}${suffix}`;
}

function fmtDelta(delta?: { abs: number | null; percent: number | null }): string {
  if (!delta || delta.abs === null) return 'нет данных';
  const sign = delta.abs > 0 ? '+' : '';
  const pct = delta.percent !== null ? ` (${sign}${delta.percent}%)` : '';
  return `${sign}${delta.abs}${pct}`;
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;

    const body = await req.json().catch(() => ({}));
    const parsedChannelId = Number(body?.channelId);
    if (!Number.isInteger(parsedChannelId) || parsedChannelId <= 0) {
      return NextResponse.json({ error: 'channelId обязателен' }, { status: 400 });
    }

    const period = parseStatsPeriod(
      typeof body?.period === 'string' ? body.period : null
    );

    const detail = authCheck.userId
      ? await getChannelDetailStats(parsedChannelId, period, authCheck.userId)
      : await getChannelDetailStats(parsedChannelId, period);

    if (!detail) {
      return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    }

    const ch = detail.channel;
    const formatsSummary = (detail.contentTypePerformance || [])
      .filter((f) => f.postsCount > 0)
      .map(
        (f) =>
          `${f.label}: ${f.postsCount} постов (${f.sharePercent}%), средние просмотры ${fmtNumber(f.avgViews)}, ERR ${fmtNumber(f.avgErr, '%')}, комментов в среднем ${fmtNumber(f.avgComments)}, репостов ${fmtNumber(f.avgForwards)}`
      )
      .join('; ');

    const topReactionsSummary = (detail.popularReactions?.top || [])
      .slice(0, 5)
      .map((r) => `${r.emoji} (${r.count} шт., ${r.sharePercent}%)`)
      .join(', ');

    const nicheSummary =
      detail.nicheBenchmark?.status === 'ready'
        ? `Ниша "${detail.nicheBenchmark.niche}" (когорта ${detail.nicheBenchmark.cohortSize} каналов): ` +
          `медиана VR 7д = ${fmtNumber(detail.nicheBenchmark.metrics.vr7d?.median, '%')}, ` +
          `медиана ERR 7д = ${fmtNumber(detail.nicheBenchmark.metrics.err7d?.median, '%')}, ` +
          `медиана ER 7д = ${fmtNumber(detail.nicheBenchmark.metrics.er7d?.median, '%')}, ` +
          `медиана постов за 7д = ${fmtNumber(detail.nicheBenchmark.metrics.posts7d?.median)}`
        : 'Недостаточно каналов в нише для сравнения с медианой';

    const fraudSummary =
      ch.fraudSignals && ch.fraudSignals.length > 0
        ? ch.fraudSignals.map((s) => `${s.signalType}: ${s.reason}`).join('; ')
        : 'Подозрительных сигналов накрутки не обнаружено';

    const metricsContext = `
Канал: "${ch.title}" (@${ch.username || 'без username'}), ниша: ${ch.niche || 'не указана'}
Выбранный период обзора: ${period}

1. ПОДПИСЧИКИ И ДИНАМИКА АУДИТОРИИ:
- Текущее число подписчиков: ${fmtNumber(ch.currentMembers)}
- Прирост за 24 часа: ${fmtDelta(ch.delta24h)}
- Прирост за 7 дней: ${fmtDelta(ch.delta7d)}
- Прирост за 30 дней: ${fmtDelta(ch.delta30d)}

2. ОХВАТЫ И ЧИТАЕМОСТЬ (VR — Visibility Rate, доля подписчиков, которые реально смотрят посты):
- Средние просмотры за 24ч: ${fmtNumber(ch.avgViews24h)} (VR 24ч: ${fmtNumber(ch.vr24h, '%')})
- Средние просмотры за 7д: ${fmtNumber(ch.avgViews7d)} (VR 7д: ${fmtNumber(ch.vr7d, '%')})
- Средние просмотры за 30д: ${fmtNumber(ch.avgViews30d)} (VR 30д: ${fmtNumber(ch.vr30d, '%')})
- Просмотры последнего поста: ${fmtNumber(ch.lastPostViews)}

3. ВОВЛЕЧЁННОСТЬ И РЕАКЦИИ АУДИТОРИИ (ER, ERR, True ERR, CR):
- ER 24ч (вовлечённость от всех подписчиков за 24ч): ${fmtNumber(ch.er24h, '%')}
- ER 7д (вовлечённость от всех подписчиков за 7д): ${fmtNumber(ch.er7d, '%')}
- ERR 24ч (вовлечённость от реально прочитавших пост за 24ч): ${fmtNumber(ch.err24h, '%')}
- ERR 7д (вовлечённость от реально прочитавших пост за 7д): ${fmtNumber(ch.err7d, '%')}
- True ERR 7д (взвешенная вовлечённость от просмотров за 7д): ${fmtNumber(ch.trueErr7d, '%')}
- CR 7д (Comment Rate — доля комментирующих за 7д): ${fmtNumber(ch.cr7d, '%')}
- Популярные реакции: ${topReactionsSummary || 'нет данных о реакциях'}

4. ЧАСТОТА ПУБЛИКАЦИЙ И РЕЖИМ ВЕДЕНИЯ КАНАЛА:
- Постов за 24 часа: ${ch.posts24h}
- Постов за 7 дней: ${ch.posts7d}
- Постов за 30 дней: ${ch.posts30d}
- Среднее число постов в день: ${fmtNumber(ch.avgPostsPerDay)}
- Статус активности: ${ch.activityStatus || 'активен'}

5. ФОРМАТЫ КОНТЕНТА:
- Разбивка по форматам: ${formatsSummary || 'нет данных по форматам'}

6. РЕКЛАМНАЯ НАГРУЗКА, ЦИТИРУЕМОСТЬ И КАЧЕСТВО:
- Доля рекламы за 7 дней (Ad Share 7d): ${ch.adShare7d ? `${ch.adShare7d.percent}% (уровень: ${ch.adShare7d.level})` : 'нет данных'}
- Доля рекламы за 30 дней (Ad Share 30d): ${ch.adShare30d ? `${ch.adShare30d.percent}% (уровень: ${ch.adShare30d.level})` : 'нет данных'}
- Индекс цитируемости (упоминания и репосты другими каналами за 30д): ${fmtNumber(ch.citationIndex)}
- Engagement Potential (EP — потенциал роста в нише): ${fmtNumber(ch.ep)}
- Индекс качества контента (Content Score): ${fmtNumber(ch.contentScore)} (грейд: ${ch.contentGrade || '-'})
- Индекс риска накрутки (Fraud Score): ${fmtNumber(ch.fraudScore)} (${fraudSummary})
- Сравнение с нишей: ${nicheSummary}
`.trim();

    const prompt = `
Ты опытный, толковый и дружелюбный SMM-специалист, который сидит рядом с клиентом (владельцем бизнеса или автором, который плохо разбирается в сложных SMM-аббревиатурах вроде ERR, VR, ER, CR, EP) и объясняет ему "на пальцах", что происходит с его Telegram-каналом по цифрам.

ЗАДАЧА
На основе реальных показателей канала составь понятный, живой и подробный разбор ВСЕХ ключевых параметров канала.
Для каждого показателя обязательно объясни:
1. Какая сейчас цифра и хорошо это или плохо.
2. Что эта метрика вообще значит простыми человеческими словами (без заумного жаргона).
3. ЧТО ИМЕННО делают пользователи судя по этой цифре (например: "открывают посты, быстро пробегают глазами, ставят быстрый лайк").
4. ЧЕГО пользователи НЕ делают судя по этой цифре (например: "почти не спускаются в комментарии, не пересылают посты друзьям в личку, часть подписчиков держит канал в папке/архиве").
5. Простой, конкретный совет SMM-щика: что подкрутить, чтобы эта цифра стала лучше.

ИСХОДНЫЕ ПОКАЗАТЕЛИ КАНАЛА:
${metricsContext}

ПРАВИЛА
- Объясняй образно, тепло, но честно и по делу — как опытный SMM-практик объясняет заказчику за чашкой кофе.
- Обязательно разбери в массиве "metricsBreakdown" минимум 7–8 ключевых показателей:
  1) Подписчики и динамика роста (приток/отток)
  2) Охваты и Читаемость (VR — сколько подписчиков реально видят посты)
  3) Вовлечённость от прочитавших (ERR / True ERR — реакция тех, кто увидел пост)
  4) Общая вовлечённость базы (ER — активность относительно всех подписчиков)
  5) Обсуждения и комментарии (CR — готовы ли люди спорить и общаться)
  6) Регулярность и темп постинга (частота выходов и паузы)
  7) Рекламная нагрузка и усталость базы (Ad Share)
  8) Цитируемость, чистота аудитории и общий индекс здоровья (Citation Index, Content Score, Fraud Score)
- Опирайся ТОЛЬКО на переданные цифры. Не выдумывай несуществующие значения. Если какой-то показатель равен "нет данных" или 0, объясни клиенту простыми словами, почему так бывает (например, закрыты комментарии или ещё мало истории).
- Строго на русском языке.

ФОРМАТ ОТВЕТА (JSON)
Ответь СТРОГО валидным JSON-объектом без markdown-обёрток по следующей схеме:
{
  "overallVerdict": {
    "headline": "Короткий диагноз канала простыми словами (1 ёмкое предложение)",
    "plainExplanation": "Развёрнутое человеческое объяснение от лица SMM-щика (3-4 предложения): в каком состоянии канал, какая главная особенность поведения его аудитории прямо сейчас.",
    "healthBadge": "Отличная форма | Хорошая база | Нужна доработка | Тревожный сигнал"
  },
  "audienceBehaviorSummary": {
    "whatTheyDo": [
      "Конкретная привычка 1 (что подписчики реально делают на канале судя по цифрам)",
      "Конкретная привычка 2",
      "Конкретная привычка 3"
    ],
    "whatTheyAvoid": [
      "Чего они НЕ делают 1 (например, читают молча без комментариев или не делятся постами)",
      "Чего они НЕ делают 2",
      "Чего они НЕ делают 3"
    ]
  },
  "metricsBreakdown": [
    {
      "metricName": "Понятное название метрики (например, 'ERR — вовлечённость тех, кто прочитал пост')",
      "metricValue": "Точное значение из данных (например, '4.2% за 7 дней')",
      "status": "good | normal | warning | critical",
      "statusLabel": "Короткая оценка (например, 'Отлично', 'В норме', 'Ниже нормы', 'Проблема')",
      "whatItMeans": "Объяснение на пальцах для человека не из SMM: что означает эта цифра.",
      "whatUsersDo": "Что именно делают подписчики судя по этому показателю.",
      "whatUsersDontDo": "Чего подписчики НЕ делают судя по этому показателю.",
      "smmAdvice": "Простой и понятный совет от SMM-щика, как улучшить этот показатель."
    }
  ],
  "topPriorities": [
    {
      "step": "Простое конкретное действие №1",
      "why": "Почему это важно сделать прямо сейчас простыми словами",
      "expectedChange": "Какой показатель от этого вырастет (например, 'Вырастет CR и число живых комментариев')"
    },
    {
      "step": "Простое конкретное действие №2",
      "why": "Почему это важно сделать",
      "expectedChange": "Какой показатель от этого вырастет"
    },
    {
      "step": "Простое конкретное действие №3",
      "why": "Почему это важно сделать",
      "expectedChange": "Какой показатель от этого вырастет"
    }
  ]
}
`.trim();

    const result = await callOpenRouter(prompt);
    await saveAiReport(parsedChannelId, 'metrics_explainer', result, authCheck.userId);
    return NextResponse.json({ explainer: result });
  } catch (error: unknown) {
    return handleAiRouteError(error);
  }
}
