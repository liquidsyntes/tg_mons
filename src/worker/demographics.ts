import { Api, TelegramClient, utils } from 'telegram';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { isRecord, parseLanguagesGraph } from '../lib/demographics';
import { getTelegramClient } from './client';
import { resolveChannelEntity, withRateLimitAndRetry, withTimeout } from './fetcher';

export async function resolveStatsGraph(client: TelegramClient, graph: Api.TypeStatsGraph, dcId: number): Promise<string | null> {
  if (graph instanceof Api.StatsGraph) return graph.json.data;
  if (graph instanceof Api.StatsGraphAsync) {
    const loaded = await withRateLimitAndRetry(() => withTimeout(
      () => client.invoke(new Api.stats.LoadAsyncGraph({ token: graph.token }), dcId), 'LoadAsyncGraph'
    ));
    if (loaded instanceof Api.StatsGraph) return loaded.json.data;
  }
  return null;
}

/** Optional statistics must never affect the ordinary collection error counter. */
export async function collectAudienceDemographics(
  client: TelegramClient,
  channel: { id: number; username: string | null; tgId: bigint | null }
): Promise<boolean> {
  const context = { channelId: channel.id };
  const identifier = channel.username || channel.tgId?.toString();
  if (!identifier) {
    logger.info('Demographics skipped: missing identifier', context);
    return false;
  }
  let stage: 'resolve' | 'capability' | 'stats' | 'graph' | 'persist' = 'resolve';
  try {
    const entity: unknown = await resolveChannelEntity(client, identifier);
    if (!(entity instanceof Api.Channel) || !entity.broadcast) {
      logger.info('Demographics skipped: not a broadcast channel', context);
      return false;
    }
    const input = utils.getInputChannel(entity);
    stage = 'capability';
    const full = await withRateLimitAndRetry(() => withTimeout(
      () => client.invoke(new Api.channels.GetFullChannel({ channel: input })), 'GetFullChannel'
    ));
    if (!(full.fullChat instanceof Api.ChannelFull) || !full.fullChat.canViewStats ||
        !full.fullChat.statsDc || full.fullChat.statsDc <= 0) {
      logger.info('Demographics skipped: statistics unavailable', context);
      return false;
    }
    const dcId = full.fullChat.statsDc;
    stage = 'stats';
    const stats = await withRateLimitAndRetry(() => withTimeout(
      () => client.invoke(new Api.stats.GetBroadcastStats({ channel: input, dark: false }), dcId), 'GetBroadcastStats'
    ));
    stage = 'graph';
    const json = await resolveStatsGraph(client, stats.languagesGraph, dcId);
    const value: unknown = json === null ? null : JSON.parse(json);
    const languages = parseLanguagesGraph(value);
    if (!languages) {
      logger.info('Demographics skipped: empty or invalid language graph', context);
      return false;
    }
    stage = 'persist';
    await prisma.audienceDemographics.create({
      data: { channelId: channel.id, languageBreakdown: languages.map(item => ({ ...item })) },
    });
    logger.info('Demographics snapshot saved', context);
    return true;
  } catch (error: unknown) {
    const code = isRecord(error) && typeof error.errorMessage === 'string' ? error.errorMessage : '';
    if (['CHAT_ADMIN_REQUIRED', 'STATS_UNAVAILABLE', 'CHANNEL_PRIVATE'].includes(code)) {
      logger.info('Demographics skipped: statistics unavailable', context);
    } else {
      // Do not log graph tokens, Telegram payloads, or database connection details.
      logger.warn('Demographics collection failed', { ...context, stage });
    }
    return false;
  }
}

let isRunning = false;

/** Align freshness with the weekly Sunday schedule in the worker's timezone. */
export function demographicsWeekStart(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export async function runDemographicsCycle(): Promise<void> {
  if (isRunning) {
    logger.info('Demographics cycle already running');
    return;
  }
  isRunning = true;
  try {
    const channels = await prisma.channel.findMany({
      where: { isActive: true, isMine: true, type: 'channel', demographics: {
        none: { capturedAt: { gte: demographicsWeekStart(new Date()) } },
      } },
      select: { id: true, username: true, tgId: true },
    });
    if (channels.length === 0) return;
    const client = await getTelegramClient();
    let successCount = 0;
    for (const channel of channels) {
      if (await collectAudienceDemographics(client, channel)) successCount++;
    }
    logger.info('Demographics cycle completed', { totalChannels: channels.length, successCount });
  } catch {
    logger.warn('Demographics cycle failed');
  } finally {
    isRunning = false;
  }
}
