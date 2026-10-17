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
    const { channelId } = await req.json();

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    const numericChannelId = Number(channelId);
    const posts = await prisma.post.findMany({
      where: {
        channelId: numericChannelId,
        text: { not: null },
      },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });

    if (posts.length === 0) {
      return NextResponse.json({ error: 'Нет текстовых постов для анализа' }, { status: 404 });
    }

    const channel = await prisma.channel.findUnique({ where: { id: numericChannelId } });
    const contentToAnalyze = formatTimestampedPosts(posts);
    const prompt = buildChannelContentSummaryPrompt({
      channelTitle: channel?.title || 'Unknown',
      scopeDescription: `последние ${posts.length} постов`,
      contentToAnalyze,
      maxChars: 80000,
      charLimitLabel: '80 000',
    });

    const result = await callOpenRouter(prompt);
    await saveAiReport(numericChannelId, 'super_report', result);
    return NextResponse.json({ summary: result });
  } catch (error: unknown) {
    return handleAiRouteError(error);
  }
}