import { afterEach, describe, expect, it, vi } from 'vitest';
import cron, { type ScheduledTask } from 'node-cron';

const tasks: ScheduledTask[] = [];

afterEach(async () => {
  for (const task of tasks.splice(0)) await task.destroy();
  vi.useRealTimers();
});

describe('worker schedules with node-cron 4', () => {
  it.each([
    ['0 * * * *', '2026-09-20T03:00:00.000Z'],
    ['0 3 * * 0', '2026-09-20T03:00:00.000Z'],
    ['15 * * * *', '2026-09-20T03:15:00.000Z'],
  ])('preserves the next execution of %s', (expression, nextRun) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T02:59:59.000Z'));
    const callback = vi.fn();
    const task = cron.schedule(expression, callback, { timezone: 'UTC' });
    tasks.push(task);
    expect(task.getNextRun()?.toISOString()).toBe(nextRun);
    expect(callback).not.toHaveBeenCalled();
  });

  it('executes an hourly callback once when its scheduled time arrives', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T02:59:59.000Z'));
    const callback = vi.fn();
    tasks.push(cron.schedule('0 * * * *', callback, { timezone: 'UTC' }));
    await vi.advanceTimersByTimeAsync(1500);
    expect(callback).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
