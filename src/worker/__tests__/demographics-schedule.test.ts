import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ schedule: vi.fn(), run: vi.fn(), warn: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: mocks.schedule, validate: (value: string) => value !== 'invalid' } }));
vi.mock('../collector', () => ({ runCollectCycle: vi.fn() }));
vi.mock('../demographics', () => ({ runDemographicsCycle: mocks.run }));
vi.mock('../ad-reach', () => ({ runAdReachCycle: vi.fn() }));
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn() } }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe('demographics scheduling', () => {
  it.each(['', 'invalid'])('uses weekly schedule for default or invalid configuration', async configured => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('DEMOGRAPHICS_CRON', configured);
    vi.stubEnv('COLLECT_ON_STARTUP', 'false');
    vi.spyOn(process, 'on').mockReturnValue(process);
    await import('../index');
    expect(mocks.schedule).toHaveBeenCalledWith('0 3 * * 0', expect.any(Function));
    if (configured === 'invalid') expect(mocks.warn).toHaveBeenCalledWith('Invalid demographics schedule; using weekly default');
  });
});
