import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTelegramCredentials, isLocalWorkerMode } from '../client';

describe('Telegram worker client credentials & local session isolation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TG_API_ID = '123456';
    process.env.TG_API_HASH = 'abcdef1234567890';
    delete process.env.TG_SESSION;
    delete process.env.TG_SESSION_LOCAL;
    delete process.env.WORKER_LOCAL_MODE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses TG_SESSION in standard server mode', () => {
    process.env.TG_SESSION = 'server-session-string';
    process.env.TG_SESSION_LOCAL = 'local-session-string';

    const creds = getTelegramCredentials();
    expect(creds.localMode).toBe(false);
    expect(creds.sessionString).toBe('server-session-string');
  });

  it('strictly uses TG_SESSION_LOCAL and ignores TG_SESSION in local worker mode', () => {
    process.env.WORKER_LOCAL_MODE = 'true';
    process.env.TG_SESSION = 'server-session-string';
    process.env.TG_SESSION_LOCAL = 'local-session-string';

    expect(isLocalWorkerMode()).toBe(true);
    const creds = getTelegramCredentials();
    expect(creds.localMode).toBe(true);
    expect(creds.sessionString).toBe('local-session-string');
  });

  it('refuses to fall back to server TG_SESSION when WORKER_LOCAL_MODE=true and TG_SESSION_LOCAL is missing', () => {
    process.env.WORKER_LOCAL_MODE = 'true';
    process.env.TG_SESSION = 'server-session-string';

    expect(() => getTelegramCredentials()).toThrow(/TG_SESSION_LOCAL is required in local worker mode/);
  });
});
