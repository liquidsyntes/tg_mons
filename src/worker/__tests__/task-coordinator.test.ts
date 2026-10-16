import { describe, expect, it, vi } from 'vitest';
import { TaskAlreadyQueuedError, TaskCoordinator, WorkerStoppingError } from '../task-coordinator';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe('TaskCoordinator', () => {
  it('serializes collection, demographics, ad reach and channel addition', async () => {
    const coordinator = new TaskCoordinator();
    const gate = deferred();
    const order: string[] = [];
    const collect = coordinator.run('collect', async () => {
      order.push('collect start');
      await gate.promise;
      order.push('collect end');
    });
    const demographics = coordinator.run('demographics', async () => { order.push('demographics'); });
    const adReach = coordinator.run('ad-reach', async () => { order.push('ad reach'); });
    const addChannel = coordinator.run('add-channel', async () => { order.push('add channel'); });
    await Promise.resolve();
    expect(order).toEqual(['collect start']);
    gate.resolve();
    await Promise.all([collect, demographics, adReach, addChannel]);
    expect(order).toEqual(['collect start', 'collect end', 'demographics', 'ad reach', 'add channel']);
  });

  it('rejects a second pending collect immediately', async () => {
    const coordinator = new TaskCoordinator();
    const gate = deferred();
    const first = coordinator.run('collect', () => gate.promise);
    const second = vi.fn();
    await expect(coordinator.run('collect', second)).rejects.toBeInstanceOf(TaskAlreadyQueuedError);
    expect(second).not.toHaveBeenCalled();
    gate.resolve();
    await first;
  });

  it('stops queued work and signals the active task during shutdown', async () => {
    const coordinator = new TaskCoordinator();
    const gate = deferred();
    let activeSignal: AbortSignal | undefined;
    const first = coordinator.run('collect', async signal => { activeSignal = signal; await gate.promise; });
    const queued = coordinator.run('demographics', vi.fn());
    await Promise.resolve();
    coordinator.requestShutdown();
    expect(activeSignal?.aborted).toBe(true);
    await expect(coordinator.run('ad-reach', vi.fn())).rejects.toBeInstanceOf(WorkerStoppingError);
    gate.resolve();
    await first;
    await expect(queued).rejects.toBeInstanceOf(WorkerStoppingError);
    await coordinator.waitForIdle();
  });
});
