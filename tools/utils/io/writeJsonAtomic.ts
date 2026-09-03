/**
 * Read-modify-write a JSON file: re-reads `path` fresh on every call (never
 * a cached parse) so a bake CLI and a dev-server endpoint mutating the same
 * `manifest.json` compose rather than clobber each other, then writes the
 * result through `<path>.tmp` + `rename` so a reader never observes a
 * partially written file.
 */
import { readFile, rename, writeFile } from 'node:fs/promises';

export async function writeJsonAtomic<T>(
  path: string,
  update: (current: T | null) => T,
): Promise<T> {
  let current: T | null = null;
  try {
    current = JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  const next = update(current);
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(next, null, 2)}\n`);
  await rename(tmpPath, path);
  return next;
}
