import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function shortSha(value: string | undefined): string | null {
  const sha = value?.trim();
  return sha && /^[0-9a-f]{7,64}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : null;
}

export function getAppVersion(gitDir = join(process.cwd(), '.git')): string | null {
  const fromBuild = shortSha(process.env.APP_COMMIT_SHA);
  if (fromBuild) return fromBuild;

  try {
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    const detached = shortSha(head);
    if (detached) return detached;
    if (!head.startsWith('ref: refs/') || head.includes('..')) return null;

    const ref = head.slice(5);
    try {
      return shortSha(readFileSync(join(gitDir, ref), 'utf8'));
    } catch {
      const packedRefs = readFileSync(join(gitDir, 'packed-refs'), 'utf8');
      const packed = packedRefs.split('\n').find(line => line.endsWith(` ${ref}`));
      return shortSha(packed?.split(' ')[0]);
    }
  } catch {
    return null;
  }
}
