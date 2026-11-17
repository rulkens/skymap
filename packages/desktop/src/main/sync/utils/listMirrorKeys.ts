import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { MIRROR_BOOKKEEPING_FILES } from '../data/mirrorBookkeepingFiles';

/**
 * The bucket keys the mirror holds a finished file for, in one async walk: bookkeeping files and
 * `.part` downloads are not keys. Never `existsSync` per key, which blocks main for seconds at 70k.
 */
export async function listMirrorKeys(dataRoot: string): Promise<Set<string>> {
  const entries = await readdir(dataRoot, { recursive: true, withFileTypes: true });
  const keys = new Set<string>();
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.endsWith('.part')) continue;
    const rel = relative(dataRoot, join(entry.parentPath, entry.name)).split(sep).join('/');
    if (!(MIRROR_BOOKKEEPING_FILES as readonly string[]).includes(rel)) keys.add(`data/${rel}`);
  }
  return keys;
}
