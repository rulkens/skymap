import { readdirSync } from 'node:fs';
import { join, posix } from 'node:path';

/** Every `.ts`/`.tsx` source under `root` (no `.d.ts`), as posix paths relative to `root`. */
export function walkTsFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, relDir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), posix.join(relDir, entry.name));
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts'))
        out.push(relDir === '.' ? entry.name : posix.join(relDir, entry.name));
    }
  };
  walk(root, '.');
  return out.sort();
}
