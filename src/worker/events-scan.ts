import { logger } from '../lib/logger';

export async function runEventsScan(): Promise<void> {
  const token = process.env.COLLECT_API_TOKEN;
  if (!token) throw new Error('COLLECT_API_TOKEN is required for event scanning');
  const baseUrl = (process.env.WEB_INTERNAL_URL || 'http://localhost:4000').replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${token}` };

  const settingsResponse = await fetch(`${baseUrl}/api/settings`, {
    headers, signal: AbortSignal.timeout(10_000),
  });
  if (!settingsResponse.ok) throw new Error(`Event scan settings check failed: HTTP ${settingsResponse.status}`);
  const settings: unknown = await settingsResponse.json();
  const hasToken = settings && typeof settings === 'object' && 'settings' in settings &&
    settings.settings && typeof settings.settings === 'object' && 'hasToken' in settings.settings &&
    settings.settings.hasToken === true;
  if (!hasToken) {
    logger.info('Event scan skipped: OpenRouter token is not configured');
    return;
  }

  const response = await fetch(`${baseUrl}/api/events/scan`, {
    method: 'POST', headers, signal: AbortSignal.timeout(20 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`Event scan failed: HTTP ${response.status}`);
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || !('success' in result) || result.success !== true) {
    throw new Error('Event scan returned an invalid response');
  }
  logger.info('Event scan completed', {
    savedCount: 'savedCount' in result && typeof result.savedCount === 'number' ? result.savedCount : 0,
  });
}
