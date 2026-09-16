import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { R2Upload } from './R2Upload';

/**
 * One `SURFACE_TILE_REGISTRY` row's virtual-texture manifest — the pointer
 * the runtime reads to discover baked tiles. Returns `[]`, not a bare item,
 * so it drops into the `buildGroups()` table the same way every other
 * collector does.
 */
export function collectSurfaceTileManifest(imagesDir: string, manifestKey: string): R2Upload[] {
  const manifestPath = join(imagesDir, manifestKey, 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  return [{ localPath: manifestPath, r2Key: `data/images/${manifestKey}/manifest.json` }];
}
