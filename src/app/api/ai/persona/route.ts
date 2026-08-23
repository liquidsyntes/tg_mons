import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';
import { callOpenRouter } from '@/lib/openrouter';
import { saveAiReport } from '@/lib/ai-reports';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const { channelId } = await req.json();

    if (!channelId) {
      return NextResponse.json({ error: 'channelId обязателен' }, { status: 400 });
    }

    // Достаем последние 30 постов независимо от даты
    const posts = await prisma.post.findMany({
      where: {
        channelId: Number(channelId),
        text: { not: null }
      },
      orderBy: { publishedAt: 'desc' },
      take: 30
    });

    if (posts.length === 0) {
      return NextResponse.json({ error: 'Нет текстовых постов для анализа' }, { status: 400 });
    }

    const postsText = posts.map(p => p.text).join('\n---\n');

    const prompt = `
Проанализируй контент этого Telegram-канала и составь подробный психологический портрет личности его владельца/автора.
Даже если авторов несколько или это корпоративный канал, анализируй его как единую "личность" или "бренд-персону", стоящую за контентом.

Особое внимание удели анализу через призму BDSM-тематики (доминантность, сабмиссивность, склонности, роли, архетипы), но сочетай это с глубоким общим психологическим портретом.

Тексты последних 30 постов:
${postsText}

ЯЗЫК ОТВЕТА (ОБЯЗАТЕЛЬНО)
- Весь отчёт формируй СТРОГО на русском языке.
- Приводимые цитаты из постов оставляй на языке оригинала.
- Все ключи JSON должны быть на английском, а значения - на русском.

Ответь строго в формате JSON, используя следующую структуру:
{
  "corePersonality": {
    "archetype": "Психологический архетип (например, 'Строгий наставник', 'Заботливый доминант', 'Мятежник')",
    "temperament": "Темперамент и стиль общения (например, холерик-экспрессивный, холодный аналитик)",
    "dominanceLevel": "Оценка уровня доминантности (от 1 до 10) с кратким пояснением",
    "bdsmRole": "Предполагаемая BDSM роль (Доминант, Саб, Свитч и т.д.) или склонность, исходя из тона и смыслов"
  },
  "psychologicalTraits": {
    "strengths": ["Сильная черта 1", "Сильная черта 2"],
    "weaknesses": ["Слабость/тень 1", "Слабость/тень 2"],
    "triggers": ["Что его триггерит/злит", "Что вызывает радость/удовлетворение"]
  },
  "communicationStyle": {
    "tone": "Тон общения с аудиторией (например, покровительственный, на равных, обучающий, агрессивный)",
    "manipulation": "Использует ли манипуляции, чувство вины, поощрения? Как именно?",
    "boundaries": "Как выстраивает личные границы с читателями?"
  },
  "summary": "Краткое резюме (2-3 предложения) — общая психологическая оценка личности, стоящей за каналом."
}
`;

    const result = await callOpenRouter(prompt);
    await saveAiReport(Number(channelId), 'persona', result);
    return NextResponse.json({ persona: result });
  } catch (error: any) {
    console.error('AI Error:', error);
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Таймаут соединения с API.' }, { status: 504 });
    }
    return NextResponse.json({ error: error.message || 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
