/** Recursive source-tree walk shared by the convention sweeps; paths stay repo-relative. */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function walkFiles(dir: string, extensions: readonly string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walkFiles(p, extensions);
    return extensions.some((ext) => p.endsWith(ext)) ? [p] : [];
  });
}
