import { Api, TelegramClient } from 'telegram';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { getTelegramClient } from './client';
import { resolveChannelEntity, withRateLimitAndRetry, withTimeout } from './fetcher';
import type { LanguageBreakdownItem } from '../lib/types';

/**
 * Parse Telegram StatsGraph into language breakdown items.
 * The graph JSON data follows chart.js-like format with columns:
 * [["x", timestamps...], ["y0", values...], ...] and names: { y0: "Russian", ... }
 */
function parseLanguagesGraphData(jsonStr: string): LanguageBreakdownItem[] | null {
  try {
    const data = JSON.parse(jsonStr);
    if (!data || !data.columns || !data.names) return null;

    const items: LanguageBreakdownItem[] = [];
    let total = 0;

    // Skip x-axis column (timestamps), process value columns
    for (const col of data.columns) {
      if (col[0] === 'x') continue;
      const key = col[0] as string;
      // Last value in the column is the most recent data point
      const value = col[col.length - 1] as number;
      if (typeof value !== 'number' || value <= 0) continue;

      total += value;
      items.push({
        code: key,
        name: data.names[key] || key,
        percent: value,
      });
    }

    if (total === 0 || items.length === 0) return null;

    // Convert raw values to percentages
    for (const item of items) {
      item.percent = Number(((item.percent / total) * 100).toFixed(1));

      // Try to extract a 2-letter language code from the name
      const nameToCode: Record<string, string> = {
        'russian': 'ru', 'english': 'en', 'ukrainian': 'uk', 'german': 'de',
        'french': 'fr', 'spanish': 'es', 'italian': 'it', 'portuguese': 'pt',
        'arabic': 'ar', 'chinese': 'zh', 'japanese': 'ja', 'korean': 'ko',
        'turkish': 'tr', 'polish': 'pl', 'dutch': 'nl', 'persian': 'fa',
        'hindi': 'hi', 'thai': 'th', 'czech': 'cs', 'romanian': 'ro',
        'hungarian': 'hu', 'swedish': 'sv', 'danish': 'da', 'finnish': 'fi',
        'norwegian': 'no', 'greek': 'el', 'hebrew': 'he', 'indonesian': 'id',
        'malay': 'ms', 'vietnamese': 'vi', 'uzbek': 'uz', 'kazakh': 'kk',
        'belarusian': 'be', 'bulgarian': 'bg', 'serbian': 'sr', 'croatian': 'hr',
        'other': 'other',
      };
      const lower = item.name.toLowerCase();
      if (nameToCode[lower]) {
        item.code = nameToCode[lower];
      }
    }

    // Sort by percent descending
    items.sort((a, b) => b.percent - a.percent);
    return items;
  } catch {
    return null;
  }
}

/**
 * Resolve a StatsGraph which may be inline data, async, or an error.
 */
async function resolveStatsGraph(
  client: TelegramClient,
  graph: any
): Promise<string | null> {
  if (!graph) return null;

  // statsGraph — inline data
  if (graph.className === 'StatsGraph' && graph.json) {
    return typeof graph.json.data === 'string' ? graph.json.data : JSON.stringify(graph.json.data);
  }

  // statsGraphAsync — need to load via token
  if (graph.className === 'StatsGraphAsync' && graph.token) {
    try {
      const loaded = await withRateLimitAndRetry(() =>
        withTimeout(
          () => client.invoke(new Api.stats.LoadAsyncGraph({ token: graph.token })),
          'LoadAsyncGraph'
        )
      );
      if (loaded && loaded.className === 'StatsGraph' && loaded.json) {
        return typeof loaded.json.data === 'string' ? loaded.json.data : JSON.stringify(loaded.json.data);
      }
    } catch (err) {
      logger.warn('Failed to load async graph', { token: graph.token }, err);
    }
    return null;
  }

  // statsGraphError
  if (graph.className === 'StatsGraphError') {
    logger.warn('Stats graph error from Telegram', { error: graph.error });
    return null;
  }

  return null;
}

/**
 * Collect audience demographics for a single channel.
 * Only works for channels where the collector account has admin rights.
 */
export async function collectAudienceDemographics(
  client: TelegramClient,
  channel: { id: number; title: string; username: string | null; tgId: bigint | null }
): Promise<boolean> {
  const identifier = channel.username || (channel.tgId ? channel.tgId.toString() : null);
  if (!identifier) {
    logger.warn('Demographics: channel has no identifier', { channelId: channel.id });
    return false;
  }

  try {
    const entity = await resolveChannelEntity(client, identifier);

    const stats = await withRateLimitAndRetry(() =>
      withTimeout(
        () => client.invoke(new Api.stats.GetBroadcastStats({
          channel: entity as any,
          dark: false,
        })),
        'GetBroadcastStats',
        identifier
      )
    );

    if (!stats || !stats.languagesGraph) {
      logger.info('Demographics: no languages_graph available', { channelId: channel.id, title: channel.title });
      return false;
    }

    const graphJson = await resolveStatsGraph(client, stats.languagesGraph);
    if (!graphJson) {
      logger.info('Demographics: could not resolve languages graph', { channelId: channel.id });
      return false;
    }

    const breakdown = parseLanguagesGraphData(graphJson);
    if (!breakdown || breakdown.length === 0) {
      logger.info('Demographics: empty language breakdown', { channelId: channel.id });
      return false;
    }

    await prisma.audienceDemographics.create({
      data: {
        channelId: channel.id,
        languageBreakdown: breakdown as any,
      },
    });

    logger.info('Demographics: saved language breakdown', {
      channelId: channel.id,
      title: channel.title,
      languages: breakdown.slice(0, 3).map(l => `${l.name} ${l.percent}%`).join(', '),
    });

    return true;
  } catch (err: any) {
    // CHAT_ADMIN_REQUIRED or similar — expected for non-admin channels
    const errMsg = err.errorMessage || err.message || String(err);
    if (errMsg.includes('ADMIN') || errMsg.includes('CHAT_ADMIN_REQUIRED') || errMsg.includes('STATS_UNAVAILABLE')) {
      logger.info('Demographics: stats not available (no admin rights)', {
        channelId: channel.id,
        title: channel.title,
      });
    } else {
      logger.warn('Demographics: unexpected error', { channelId: channel.id, title: channel.title }, err);
    }
    return false;
  }
}

/**
 * Run demographics collection cycle for all isMine channels.
 */
export async function runDemographicsCycle(): Promise<void> {
  logger.info('Demographics cycle started');

  const channels = await prisma.channel.findMany({
    where: { isActive: true, isMine: true },
    select: { id: true, title: true, username: true, tgId: true },
  });

  if (channels.length === 0) {
    logger.info('Demographics: no isMine channels found');
    return;
  }

  let client: TelegramClient;
  try {
    client = await getTelegramClient();
  } catch (err) {
    logger.error('Demographics: failed to get Telegram client', undefined, err);
    return;
  }

  let successCount = 0;
  for (const ch of channels) {
    const success = await collectAudienceDemographics(client, {
      ...ch,
      tgId: ch.tgId ? BigInt(ch.tgId.toString()) : null,
    });
    if (success) successCount++;
  }

  logger.info('Demographics cycle completed', {
    totalChannels: channels.length,
    successCount,
  });
}
