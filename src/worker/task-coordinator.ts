export type WorkerTaskKind = 'collect' | 'demographics' | 'ad-reach' | 'add-channel';

export class TaskAlreadyQueuedError extends Error {
  constructor(public readonly kind: WorkerTaskKind) {
    super(`${kind} task already queued or running`);
    this.name = 'TaskAlreadyQueuedError';
  }
}

export class WorkerStoppingError extends Error {
  constructor() {
    super('Worker is stopping');
    this.name = 'WorkerStoppingError';
  }
}

/** Serializes all operations that may use the shared TelegramClient. */
export class TaskCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private readonly pending = new Set<WorkerTaskKind>();
  private readonly controller = new AbortController();
  private stopping = false;

  run<T>(kind: WorkerTaskKind, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.stopping) return Promise.reject(new WorkerStoppingError());
    if (kind !== 'add-channel' && this.pending.has(kind)) {
      return Promise.reject(new TaskAlreadyQueuedError(kind));
    }
    this.pending.add(kind);
    const operation = this.tail.then(() => {
      if (this.stopping) throw new WorkerStoppingError();
      return task(this.controller.signal);
    });
    this.tail = operation.then(() => {}, () => {}).then(() => {
      this.pending.delete(kind);
    });
    return operation;
  }

  requestShutdown(): void {
    this.stopping = true;
    this.controller.abort();
  }

  waitForIdle(): Promise<void> {
    return this.tail;
  }
}
