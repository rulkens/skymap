import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { R2Upload } from './R2Upload';

/**
 * The hi-res famous-galaxy WebPs, written one per curated galaxy by
 * `tools/famous/copyHiResToPublic.ts`.
 *
 * Returns `[]` when the directory is absent — a checkout that hasn't run the
 * curator should not fail the sync.
 */
export function collectHiResImages(sourceDir: string): R2Upload[] {
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir)
    .filter((name) => name.endsWith('.webp'))
    .filter((name) => statSync(join(sourceDir, name)).isFile())
    .sort()
    .map((name) => ({
      localPath: join(sourceDir, name),
      r2Key: `data/images/famous-hires/${name}`,
    }));
}
