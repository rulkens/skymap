import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { R2Upload } from './R2Upload';
import { allowDataFile } from './allowDataFile';

/**
 * The flat `public/data/` sweep — the catalog bins and their JSON sidecars.
 *
 * Deliberately not recursive: the `images/` subtree below it holds tens of
 * thousands of files with their own upload policies, collected separately.
 */
export function collectDataFiles(sourceDir: string): R2Upload[] {
  return readdirSync(sourceDir)
    .filter(allowDataFile)
    .sort()
    .map((name) => ({ localPath: join(sourceDir, name), r2Key: `data/${name}` }));
}
