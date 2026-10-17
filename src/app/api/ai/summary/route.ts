import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';
import { callOpenRouter } from '@/lib/openrouter';
import {
  buildChannelContentSummaryPrompt,
  formatTimestampedPosts,
  handleAiRouteError,
  saveAiReport,
} from '@/lib/ai-reports';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const { channelId, days = 7 } = await req.json();

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    const numericChannelId = Number(channelId);
    const dateLimit = new Date(Date.now() - days * 24 * 3600 * 1000);
    const posts = await prisma.post.findMany({
      where: {
        channelId: numericChannelId,
        publishedAt: { gte: dateLimit },
        text: { not: null },
      },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });

    if (posts.length === 0) {
      return NextResponse.json({ error: 'Нет текстовых постов за выбранный период для анализа' }, { status: 404 });
    }

    const channel = await prisma.channel.findUnique({ where: { id: numericChannelId } });
    const contentToAnalyze = formatTimestampedPosts(posts);
    const prompt = buildChannelContentSummaryPrompt({
      channelTitle: channel?.title || 'Unknown',
      scopeDescription: `посты за последние ${days} дней`,
      contentToAnalyze,
      maxChars: 30000,
      charLimitLabel: '30 000',
    });

    const result = await callOpenRouter(prompt);
    await saveAiReport(numericChannelId, 'summary', result);
    return NextResponse.json({ summary: result });
  } catch (error: unknown) {
    return handleAiRouteError(error);
  }
}