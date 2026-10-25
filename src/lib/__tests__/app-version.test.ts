import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAppVersion } from '../app-version';

describe('getAppVersion', () => {
  let gitDir: string;

  beforeEach(() => {
    gitDir = mkdtempSync(join(tmpdir(), 'tgmon-version-'));
    vi.stubEnv('APP_COMMIT_SHA', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(gitDir, { recursive: true, force: true });
  });

  it('prefers the commit baked into the running image', () => {
    vi.stubEnv('APP_COMMIT_SHA', '280762e'.padEnd(40, 'a'));
    expect(getAppVersion(gitDir)).toBe('280762e');
  });

  it('reads a local branch head without requiring the git executable', () => {
    mkdirSync(join(gitDir, 'refs', 'heads'), { recursive: true });
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(gitDir, 'refs', 'heads', 'main'), 'abcdef1'.padEnd(40, '2') + '\n');
    expect(getAppVersion(gitDir)).toBe('abcdef1');
  });

  it('reads packed refs and detached heads', () => {
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(gitDir, 'packed-refs'), '1234567'.padEnd(40, '3') + ' refs/heads/main\n');
    expect(getAppVersion(gitDir)).toBe('1234567');

    writeFileSync(join(gitDir, 'HEAD'), 'fedcba9'.padEnd(40, '4') + '\n');
    expect(getAppVersion(gitDir)).toBe('fedcba9');
  });

  it('returns null rather than inventing a version when metadata is unavailable', () => {
    vi.stubEnv('APP_COMMIT_SHA', 'not-a-commit');
    expect(getAppVersion(gitDir)).toBeNull();
  });
});
