import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { R2Upload } from './R2Upload';

/**
 * The Earth virtual-texture manifest — the pointer the runtime reads to
 * discover baked tiles. Returns `[]`, not a bare item, so it drops into the
 * `buildGroups()` table the same way every other collector does.
 */
export function collectEarthTileManifest(imagesDir: string): R2Upload[] {
  const manifestPath = join(imagesDir, 'earth-tiles', 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  return [{ localPath: manifestPath, r2Key: 'data/images/earth-tiles/manifest.json' }];
}
