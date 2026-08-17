import { readdirSync } from 'node:fs';
import { join, posix } from 'node:path';

/**
 * Every file under `dataDir`, as posix-relative paths, except the `images/`
 * subtree — thousands of lazily-fetched thumbnails/textures that stay
 * path-stable and are never hashed or manifested.
 */
export function walkDataFiles(dataDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, relDir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'images') continue;
        walk(join(dir, entry.name), posix.join(relDir, entry.name));
      } else if (entry.isFile()) {
        out.push(posix.join(relDir, entry.name));
      }
    }
  };
  walk(dataDir, '.');
  return out;
}
