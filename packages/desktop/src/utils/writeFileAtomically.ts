import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';

/**
 * Owner-only, via a uniquely named file beside the target renamed over it: a reader sees the old
 * file or the new, never half, and two writes in flight never share a temp file.
 */
export async function writeFileAtomically(path: string, data: string): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, data, { mode: 0o600 });
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}
