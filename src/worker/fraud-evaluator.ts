import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import {
  checkViewsToSubsRatio,
  checkGrowthSmoothness,
  checkUncorrelatedSpikes,
  checkUniformReactionRatio,
  checkHourlyViewProfile,
  checkNightBotActivity,
} from '../lib/fraudDetector';
import { getPreviousSnapshot, saveFraudSignal } from './persister';

interface FraudChannel {
  id: number;
  title: string;
  username: string | null;
  tgId: bigint | null;
}

export async function evaluateAndSaveChannelFraudSignals(channel: FraudChannel): Promise<void> {
  try {
    const recentMetrics = await prisma.channelMetricDaily.findMany({
      where: { channelId: channel.id },
      orderBy: { date: 'desc' },
      take: 30,
    });

    const recentPosts = await prisma.post.findMany({
      where: { channelId: channel.id },
      orderBy: { publishedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        views: true,
        reactions: true,
        comments: true,
        forwards: true,
        publishedAt: true,
        snapshots: {
          select: { views: true, collectedAt: true },
          orderBy: { collectedAt: 'asc' },
        },
        viewSnapshots: {
          select: { hoursAfterPost: true, viewsCount: true, capturedAt: true },
          orderBy: { hoursAfterPost: 'asc' },
        },
        engagementHours: {
          select: { hourStart: true, reactionsAdded: true, forwardsAdded: true },
        },
      },
    });

    const mentionConditions: Prisma.MentionWhereInput[] = [];
    if (channel.username) {
      mentionConditions.push({ targetUsername: channel.username.toLowerCase() });
    }
    if (channel.tgId) {
      mentionConditions.push({ targetTgId: channel.tgId });
    }

    let minMentionDate: Date | null = null;
    if (recentMetrics.length > 0) {
      const sortedDesc = [...recentMetrics].sort((a, b) => b.date.getTime() - a.date.getTime());
      const oldestMetricDate = sortedDesc[sortedDesc.length - 1].date;
      minMentionDate = new Date(oldestMetricDate.getTime() - 86400000);
    } else if (recentPosts.length > 0) {
      const oldestPostMs = Math.min(...recentPosts.map(p => new Date(p.publishedAt).getTime()).filter(Number.isFinite));
      if (Number.isFinite(oldestPostMs)) {
        minMentionDate = new Date(oldestPostMs - 86400000);
      }
    }

    let mentionsDates: Date[] = [];
    if (mentionConditions.length > 0 && minMentionDate && typeof prisma.mention?.findMany === 'function') {
      const mentionsInRange = await prisma.mention.findMany({
        where: { createdAt: { gte: minMentionDate }, OR: mentionConditions },
        select: { createdAt: true },
      });
      mentionsDates = mentionsInRange.map(m => m.createdAt);
    }

    if (recentMetrics.length > 0) {
      const smoothnessResult = checkGrowthSmoothness(recentMetrics);
      await saveFraudSignal(channel.id, 'growth_smoothness', {
        flag: smoothnessResult.flag, value: smoothnessResult.cv, reason: smoothnessResult.reason,
      });

      const sortedDesc = [...recentMetrics].sort((a, b) => b.date.getTime() - a.date.getTime());
      const oldestMetricDate = sortedDesc[sortedDesc.length - 1].date;
      const minDate = new Date(oldestMetricDate.getTime() - 86400000);

      const postsInRange = await prisma.post.findMany({
        where: { channelId: channel.id, publishedAt: { gte: minDate } },
        select: { publishedAt: true },
      });

      const postsDates = postsInRange.map(p => p.publishedAt);
      const spikeResult = checkUncorrelatedSpikes(recentMetrics, postsDates, mentionsDates);
      await saveFraudSignal(channel.id, 'uncorrelated_spikes', {
        flag: spikeResult.flag, value: spikeResult.spikesCount, reason: spikeResult.reason,
      });
    } else {
      await saveFraudSignal(channel.id, 'growth_smoothness', { flag: false, value: 0, reason: '' });
      await saveFraudSignal(channel.id, 'uncorrelated_spikes', { flag: false, value: 0, reason: '' });
    }

    const latestSnapshot = await getPreviousSnapshot(channel.id);
    const currentMembers = latestSnapshot?.membersCount || 0;

    if (currentMembers > 0) {
      const ratioResult = checkViewsToSubsRatio(recentPosts, currentMembers);
      await saveFraudSignal(channel.id, 'views_to_subs_ratio', {
        flag: ratioResult.flag, value: ratioResult.ratio, reason: ratioResult.reason,
      });
    } else {
      await saveFraudSignal(channel.id, 'views_to_subs_ratio', { flag: false, value: 0, reason: '' });
    }

    const uniformResult = checkUniformReactionRatio(recentPosts);
    await saveFraudSignal(channel.id, 'uniform_err', {
      flag: uniformResult.flag, value: uniformResult.cv, reason: uniformResult.reason,
    });

    const hourlyProfileResult = checkHourlyViewProfile({
      id: channel.id,
      posts: recentPosts,
      mentionsDates,
    });
    await saveFraudSignal(channel.id, 'unnatural_view_decay', {
      flag: hourlyProfileResult.flag,
      value: hourlyProfileResult.value ?? hourlyProfileResult.lateViewsShare,
      reason: hourlyProfileResult.flag ? hourlyProfileResult.reason : '',
    });

    const nightActivityResult = checkNightBotActivity({
      id: channel.id,
      posts: recentPosts,
    });
    await saveFraudSignal(channel.id, 'night_bot_activity', {
      flag: nightActivityResult.flag,
      value: nightActivityResult.value ?? nightActivityResult.nightViewsShare,
      reason: nightActivityResult.flag ? nightActivityResult.reason : '',
    });
  } catch (fraudErr: unknown) {
    logger.error('Fraud detection failed', { title: channel.title }, fraudErr);
  }
}
