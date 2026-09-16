import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import bigInt from 'big-integer';
import { collectAudienceDemographics, resolveStatsGraph, runDemographicsCycle, demographicsWeekStart } from '../demographics';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), create: vi.fn(), find: vi.fn(), client: vi.fn(), info: vi.fn(), warn: vi.fn() }));
vi.mock('../fetcher', () => ({ resolveChannelEntity: mocks.resolve,
  withRateLimitAndRetry: (fn: () => Promise<unknown>) => fn(),
  withTimeout: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../client', () => ({ getTelegramClient: mocks.client }));
vi.mock('../../lib/prisma', () => ({ prisma: { audienceDemographics: { create: mocks.create }, channel: { findMany: mocks.find } } }));
vi.mock('../../lib/logger', () => ({ logger: { info: mocks.info, warn: mocks.warn } }));

const channel = { id: 1, username: 'test_channel', tgId: null };
const graph = new Api.StatsGraph({ json: new Api.DataJSON({ data: JSON.stringify({ columns: [['x', 1], ['y0', 10]], names: { y0: 'English' } }) }) });
const full = new Api.ChannelFull({ id: bigInt(1), about: '', readInboxMaxId: 0, readOutboxMaxId: 0, unreadCount: 0, chatPhoto: new Api.PhotoEmpty({ id: bigInt(0) }), notifySettings: new Api.PeerNotifySettings({}), botInfo: [], pts: 0, canViewStats: true, statsDc: 4 });
const entity = new Api.Channel({ id: bigInt(1), accessHash: bigInt(2), broadcast: true, title: 'Test', photo: new Api.ChatPhotoEmpty(), date: 0 });
const client = new TelegramClient(new StringSession(''), 1, 'test', { connectionRetries: 0 });
const invoke = vi.fn();
client.invoke = invoke;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolve.mockResolvedValue(entity);
  mocks.client.mockResolvedValue(client);
  mocks.find.mockResolvedValue([channel]);
  invoke.mockResolvedValueOnce({ fullChat: full }).mockResolvedValueOnce({ languagesGraph: graph });
});

describe('demographics collection', () => {
  it('uses statistics DC and persists a language snapshot', async () => {
    expect(await collectAudienceDemographics(client, channel)).toBe(true);
    expect(invoke.mock.calls[1][1]).toBe(4);
    expect(mocks.create).toHaveBeenCalledWith({ data: { channelId: 1, languageBreakdown: [{ code: 'en', name: 'English', percent: 100 }] } });
  });
  it('loads async graphs from the same DC', async () => {
    invoke.mockReset().mockResolvedValue(graph);
    expect(await resolveStatsGraph(client, new Api.StatsGraphAsync({ token: 'private-token' }), 4)).toBe(graph.json.data);
    expect(invoke).toHaveBeenCalledWith(expect.any(Api.stats.LoadAsyncGraph), 4);
  });
  it('handles graph errors without logging their content', async () => {
    expect(await resolveStatsGraph(client, new Api.StatsGraphError({ error: 'private-data' }), 4)).toBeNull();
    expect(mocks.warn).not.toHaveBeenCalled();
  });
  it('skips channels without rights', async () => {
    invoke.mockReset().mockResolvedValue({ fullChat: new Api.ChannelFull({ ...full, canViewStats: false }) });
    expect(await collectAudienceDemographics(client, channel)).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('skips groups', async () => {
    mocks.resolve.mockResolvedValue(new Api.Channel({ ...entity, broadcast: false }));
    expect(await collectAudienceDemographics(client, channel)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
  it.each(['CHAT_ADMIN_REQUIRED', 'STATS_UNAVAILABLE', 'FLOOD_WAIT_30', 'TIMEOUT'])('isolates %s', async errorMessage => {
    invoke.mockReset().mockRejectedValue({ errorMessage });
    expect(await collectAudienceDemographics(client, channel)).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('continues with another channel after failure', async () => {
    mocks.find.mockResolvedValue([channel, { ...channel, id: 2 }]);
    invoke.mockReset().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ fullChat: full }).mockResolvedValueOnce({ languagesGraph: graph });
    await runDemographicsCycle();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ channelId: 2 }) }));
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ type: 'channel', demographics: expect.any(Object) }) }));
  });
  it('prevents overlapping cycles and unlocks after failure', async () => {
    let release: (value: never[]) => void = () => {};
    mocks.find.mockReturnValueOnce(new Promise<never[]>(resolve => { release = resolve; }));
    const first = runDemographicsCycle();
    await runDemographicsCycle();
    expect(mocks.find).toHaveBeenCalledTimes(1);
    release([]);
    await first;
    mocks.find.mockRejectedValueOnce(new Error('db unavailable'));
    await runDemographicsCycle();
    mocks.find.mockResolvedValueOnce([]);
    await runDemographicsCycle();
    expect(mocks.find).toHaveBeenCalledTimes(3);
  });
});



describe('weekly freshness', () => {
  it('starts on Sunday regardless of collection completion time', () => {
    const previousSunday = new Date(2026, 8, 6, 3, 0, 35);
    const nextSunday = new Date(2026, 8, 13, 3, 0, 20);
    const cutoff = demographicsWeekStart(nextSunday);
    expect(cutoff).toEqual(new Date(2026, 8, 13, 0, 0, 0));
    expect(previousSunday < cutoff).toBe(true);
    expect(demographicsWeekStart(new Date(2026, 8, 19, 23, 59))).toEqual(cutoff);
  });
});
