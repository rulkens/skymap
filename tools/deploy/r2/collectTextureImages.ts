import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { R2Upload } from './R2Upload';

/**
 * The tiered planet-surface textures — one `<body>-<size>.{jpg,webp}` per
 * surface and ring sheet, written by the texture build.
 *
 * Returns `[]` when the directory is absent, so a code-only deploy that never
 * ran the texture build still syncs.
 */
export function collectTextureImages(sourceDir: string): R2Upload[] {
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir)
    .filter((name) => name.endsWith('.jpg') || name.endsWith('.webp'))
    .filter((name) => statSync(join(sourceDir, name)).isFile())
    .sort()
    .map((name) => ({
      localPath: join(sourceDir, name),
      r2Key: `data/images/textures/${name}`,
    }));
}
