import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfigFromFile } from '@prisma/config';

describe('Prisma configuration with patched deepmerge-ts', () => {
  it('loads schema and nested migration settings through the real loader', async () => {
    const root = resolve(__dirname, 'fixtures');
    const result = await loadConfigFromFile({
      configRoot: root,
      configFile: resolve(root, 'security-prisma.config.mjs'),
    });
    expect(result.error).toBeUndefined();
    expect(result.config?.schema).toBe(resolve(root, 'schema.prisma'));
    expect(result.config?.migrations).toEqual({
      path: resolve(root, 'migrations'), seed: 'node seed.js',
    });
  });
});
