export class WorkerRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'WorkerRequestError';
  }
}

export interface CollectResult {
  totalChannels: number;
  successCount: number;
  errorCount: number;
  totalPosts: number;
  totalSnapshots: number;
  durationMs: number;
}

function isCollectResult(value: unknown): value is CollectResult {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return ['totalChannels', 'successCount', 'errorCount', 'totalPosts', 'totalSnapshots', 'durationMs']
    .every(field => typeof record[field] === 'number' && Number.isFinite(record[field]));
}

async function requestWorker(path: string, body?: object): Promise<unknown> {
  const token = process.env.COLLECT_API_TOKEN;
  if (!token) throw new WorkerRequestError(503, 'Связь с worker не настроена');
  const base = process.env.WORKER_INTERNAL_URL || 'http://localhost:4001';
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new WorkerRequestError(503, 'Worker недоступен');
  }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error : 'Ошибка worker';
    throw new WorkerRequestError(response.status, message);
  }
  return result;
}

export async function requestWorkerCollection(): Promise<CollectResult> {
  const response = await requestWorker('/internal/collect');
  if (!response || typeof response !== 'object' || !('result' in response) ||
      !isCollectResult(response.result)) {
    throw new WorkerRequestError(502, 'Некорректный ответ worker');
  }
  return response.result;
}

export async function requestWorkerAddChannel(input: string, isMine: boolean): Promise<number> {
  const response = await requestWorker('/internal/channels', { input, isMine });
  if (!response || typeof response !== 'object' || !('channelId' in response) ||
      !Number.isSafeInteger(response.channelId) || Number(response.channelId) <= 0) {
    throw new WorkerRequestError(502, 'Некорректный ответ worker');
  }
  return Number(response.channelId);
}
