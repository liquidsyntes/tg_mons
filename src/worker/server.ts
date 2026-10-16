import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { addChannelByInput, collectChannelData, runCollectCycle } from './collector';
import { getTelegramClient } from './client';
import { CollectAlreadyRunningError } from './persister';
import { TaskAlreadyQueuedError, TaskCoordinator, WorkerStoppingError } from './task-coordinator';

function sendJson(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function authorized(req: IncomingMessage): boolean {
  const expected = process.env.COLLECT_API_TOKEN;
  const supplied = req.headers.authorization;
  if (!expected || !supplied?.startsWith('Bearer ')) return false;
  const token = supplied.slice(7);
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += data.length;
    if (length > 8192) throw new SyntaxError('Request body too large');
    chunks.push(data);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export function createWorkerServer(coordinator: TaskCoordinator): Server {
  return createServer(async (req, res) => {
    if (!authorized(req)) {
      sendJson(res, 401, { error: 'Требуется Bearer токен' });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Метод не поддерживается' });
      return;
    }
    try {
      if (req.url === '/internal/collect') {
        const result = await coordinator.run('collect', signal => runCollectCycle(signal));
        sendJson(res, 200, { result });
        return;
      }
      if (req.url === '/internal/channels') {
        const body = await readJson(req);
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            !('input' in body) || typeof body.input !== 'string' ||
            !body.input.trim() || body.input.length > 256 ||
            ('isMine' in body && typeof body.isMine !== 'boolean')) {
          sendJson(res, 400, { error: 'Параметр input (username или ссылка) обязателен' });
          return;
        }
        const input = body.input.trim();
        const isMine = 'isMine' in body ? body.isMine === true : false;
        const channelId = await coordinator.run('add-channel', async signal => {
          const channel = await addChannelByInput(input, isMine);
          if (!signal.aborted) {
            try {
              const client = await getTelegramClient();
              await collectChannelData(client, channel, true);
            } catch (error) {
              logger.warn('Initial channel backfill failed', { channelId: channel.id });
              await prisma.channel.update({
                where: { id: channel.id },
                data: { lastError: error instanceof Error ? error.message : 'Ошибка первичного сбора' },
              });
            }
          }
          return channel.id;
        });
        sendJson(res, 201, { channelId });
        return;
      }
      sendJson(res, 404, { error: 'Маршрут не найден' });
    } catch (error) {
      if (error instanceof CollectAlreadyRunningError ||
          (error instanceof TaskAlreadyQueuedError && error.kind === 'collect')) {
        sendJson(res, 409, { error: 'Сбор уже выполняется' });
      } else if (error instanceof WorkerStoppingError) {
        sendJson(res, 503, { error: 'Worker останавливается' });
      } else if (error instanceof SyntaxError) {
        sendJson(res, 400, { error: 'Некорректный JSON' });
      } else if (req.url === '/internal/channels') {
        logger.warn('Could not add channel through worker');
        sendJson(res, 400, { error: error instanceof Error ? error.message : 'Ошибка добавления канала' });
      } else {
        logger.error('Worker request failed', undefined, error);
        sendJson(res, 500, { error: 'Ошибка выполнения сбора' });
      }
    }
  });
}

export function listenWorkerServer(server: Server): Promise<void> {
  const port = Number(process.env.WORKER_INTERNAL_PORT || 4001);
  const host = process.env.WORKER_INTERNAL_HOST || '127.0.0.1';
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      logger.info('Worker internal API listening', { host, port });
      resolve();
    });
  });
}
