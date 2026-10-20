import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ schedule: vi.fn(), run: vi.fn(), warn: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: mocks.schedule, validate: (value: string) => value !== 'invalid' } }));
vi.mock('../collector', () => ({ runCollectCycle: vi.fn() }));
vi.mock('../demographics', () => ({ runDemographicsCycle: mocks.run }));
vi.mock('../ad-reach', () => ({ runAdReachCycle: vi.fn() }));
vi.mock('../server', () => ({ createWorkerServer: vi.fn(() => ({ close: vi.fn() })), listenWorkerServer: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../client', () => ({ disconnectTelegramClient: vi.fn().mockResolvedValue(undefined) }));
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn() } }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe('demographics scheduling', () => {
  it.each(['', 'invalid'])('uses weekly schedule for default or invalid configuration', async configured => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('DEMOGRAPHICS_CRON', configured);
    vi.stubEnv('COLLECT_ON_STARTUP', 'false');
    vi.stubEnv('COLLECT_API_TOKEN', 'test-token');
    vi.spyOn(process, 'on').mockReturnValue(process);
    await import('../index');
    await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalledWith('0 3 * * 0', expect.any(Function)));
    if (configured === 'invalid') expect(mocks.warn).toHaveBeenCalledWith('Invalid demographics schedule; using weekly default');
  });

  it('skips cron scheduling when WORKER_DISABLE_CRON=true', async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('WORKER_DISABLE_CRON', 'true');
    vi.stubEnv('COLLECT_API_TOKEN', 'test-token');
    vi.spyOn(process, 'on').mockReturnValue(process);
    await import('../index');
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
});
