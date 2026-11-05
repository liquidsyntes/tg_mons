import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ schedule: vi.fn(), on: vi.fn(), runScan: vi.fn(), collect: vi.fn(), shouldRecover: vi.fn(), error: vi.fn(), warn: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: mocks.schedule, validate: vi.fn(() => true) } }));
vi.mock('../collector', () => ({ runCollectCycle: mocks.collect, getActiveSyncJobId: vi.fn(() => null) }));
vi.mock('../sync-jobs', () => ({ shouldRecoverSyncJobOnStartup: mocks.shouldRecover }));
vi.mock('../demographics', () => ({ runDemographicsCycle: vi.fn() }));
vi.mock('../ad-reach', () => ({ runAdReachCycle: vi.fn() }));
vi.mock('../events-scan', () => ({ runEventsScan: mocks.runScan }));
vi.mock('@/lib/digest', () => ({ runDailyDigestIfDue: vi.fn() }));
vi.mock('../server', () => ({ createWorkerServer: vi.fn(() => ({ close: vi.fn() })), listenWorkerServer: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../client', () => ({ disconnectTelegramClient: vi.fn().mockResolvedValue(undefined) }));
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: mocks.warn, error: mocks.error } }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function start(localMode: boolean, disableCron: boolean, stale = false): Promise<void> {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.schedule.mockReturnValue({ on: mocks.on });
  mocks.shouldRecover.mockResolvedValue(stale);
  vi.stubEnv('COLLECT_API_TOKEN', 'test-token');
  vi.stubEnv('COLLECT_ON_STARTUP', 'false');
  vi.stubEnv('EVENTS_SCAN_CRON', '30 */6 * * *');
  vi.stubEnv('WORKER_LOCAL_MODE', String(localMode));
  vi.stubEnv('WORKER_DISABLE_CRON', String(disableCron));
  vi.spyOn(process, 'on').mockReturnValue(process);
  await import('../index');
  if (!disableCron) await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalled());
}

describe('event scan scheduling', () => {
  it('schedules an independent UTC scan outside local mode', async () => {
    await start(false, false);
    expect(mocks.schedule).toHaveBeenCalledWith('30 */6 * * *', expect.any(Function), { timezone: 'UTC' });
  });

  it.each([[true, false], [false, true]])('skips background event scans in local or no-cron mode', async (localMode, disableCron) => {
    await start(localMode, disableCron);
    expect(mocks.schedule).not.toHaveBeenCalledWith('30 */6 * * *', expect.any(Function), { timezone: 'UTC' });
  });

  it('isolates a failed scan from the regular collection task', async () => {
    await start(false, false);
    mocks.runScan.mockRejectedValue(new Error('Synthetic scan failure'));
    mocks.collect.mockResolvedValue({});
    const eventCallback = mocks.schedule.mock.calls.find(([expression]) => expression === '30 */6 * * *')?.[1] as () => void;
    const collectCallback = mocks.schedule.mock.calls.find(([expression]) => expression === '0 * * * *')?.[1] as () => void;
    eventCallback();
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Event scan failed', undefined, expect.any(Error)));
    collectCallback();
    await vi.waitFor(() => expect(mocks.collect).toHaveBeenCalledOnce());
  });

  it('runs one recovery cycle for multiple missed collection slots', async () => {
    await start(true, false);
    let finish: (value: object) => void = () => {};
    mocks.collect.mockReturnValue(new Promise<object>(resolve => { finish = resolve; }));
    const missed = mocks.on.mock.calls.find(([event]) => event === 'execution:missed')?.[1] as (() => void) | undefined;
    expect(missed).toBeTypeOf('function');

    missed?.();
    missed?.();
    await vi.waitFor(() => expect(mocks.collect).toHaveBeenCalledOnce());
    missed?.();
    expect(mocks.collect).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledWith('Scheduled collection missed; running recovery cycle');
    finish({});
  });

  it('runs a recovery cycle on startup when the last SyncJob is stale', async () => {
    mocks.collect.mockResolvedValue({});
    await start(true, false, true);
    await vi.waitFor(() => expect(mocks.collect).toHaveBeenCalledOnce());
    expect(mocks.warn).toHaveBeenCalledWith('Stale SyncJob found on startup; running recovery cycle');
  });
});
