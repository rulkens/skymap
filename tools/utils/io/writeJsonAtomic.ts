/**
 * Read-modify-write a JSON file: re-reads `path` fresh on every call — never
 * a cached parse — so a bake CLI and a dev-server endpoint mutating the same
 * `manifest.json` compose rather than clobber each other, then writes the
 * result through a per-call-unique `<path>.<pid>.<random>.tmp` + `rename` so
 * a reader never observes a partial write and two concurrent writers never
 * share (and corrupt) the same temp file.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

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
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tmpPath, `${JSON.stringify(next, null, 2)}\n`);
  await rename(tmpPath, path);
  return next;
}
