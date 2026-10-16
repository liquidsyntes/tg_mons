import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const DEFAULT_AI_MODEL = 'z-ai/glm-5.3-flash';
const CACHE_TTL_MS = 30_000;

export interface AiConfig {
  apiKey: string | null;
  model: string;
}

let cachedConfig: Promise<AiConfig> | null = null;
let cachedUntil = 0;

export function invalidateAiConfigCache(): void {
  cachedConfig = null;
  cachedUntil = 0;
}

export async function getAiConfig(): Promise<AiConfig> {
  if (cachedConfig && Date.now() < cachedUntil) return cachedConfig;

  cachedUntil = Date.now() + CACHE_TTL_MS;
  cachedConfig = prisma.systemSetting.findUnique({ where: { id: 'global' } })
    .then(settings => ({
      apiKey: settings?.aiToken?.trim() || process.env.OPENROUTER_API_KEY?.trim() || null,
      model: settings?.aiModel?.trim() || DEFAULT_AI_MODEL,
    }))
    .catch(() => {
      logger.warn('AI settings unavailable; using environment fallback');
      return { apiKey: process.env.OPENROUTER_API_KEY?.trim() || null, model: DEFAULT_AI_MODEL };
    });
  return cachedConfig;
}

export function maskAiToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (token.length < 8) return '***';
  const prefix = token.startsWith('sk-or-') && token.length > 14 ? 'sk-or-' : '';
  return `${prefix}...${token.slice(-4)}`;
}
