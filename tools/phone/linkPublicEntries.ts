import { existsSync, readdirSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Symlink every top-level `public/` entry into a build made with
 * `copyPublicDir: false`, so the 2.8 GB `public/data` is served, not copied.
 * Must run after every build: `emptyOutDir` deletes the links. Entries the
 * build itself wrote win. Returns the names linked.
 */
export function linkPublicEntries(publicDir: string, outDir: string): string[] {
  const linked: string[] = [];
  for (const name of readdirSync(publicDir)) {
    const link = join(outDir, name);
    if (existsSync(link)) continue;
    symlinkSync(resolve(publicDir, name), link);
    linked.push(name);
  }
  return linked;
}
