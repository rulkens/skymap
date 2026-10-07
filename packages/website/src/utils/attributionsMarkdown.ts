import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The text of the repository's `ATTRIBUTIONS.md`, found by walking up from the
 * working directory: the site build runs in `packages/website`, the tests and
 * the link check at the root, and a bundled page module has no path of its own
 * to start from. Node only, so it is for build-time modules, never a script
 * the browser loads.
 */
export function attributionsMarkdown(): string {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const file = join(dir, 'ATTRIBUTIONS.md');
    if (existsSync(file)) return readFileSync(file, 'utf8');
    if (dirname(dir) === dir)
      throw new Error('ATTRIBUTIONS.md not found above the working directory');
  }
}
