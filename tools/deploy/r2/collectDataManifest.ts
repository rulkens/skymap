import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { R2Upload } from './R2Upload';

/**
 * `manifest.json` as its own upload — the pointer the runtime resolves
 * logical catalog paths through. Mirrors `collectEarthTileManifest`: `[]`
 * when absent, so it drops into `buildGroups()` the same way every other
 * collector does; its caller places the group last so it never names a
 * hashed file this run hasn't finished uploading.
 */
export function collectDataManifest(sourceDir: string): R2Upload[] {
  const manifestPath = join(sourceDir, 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  return [{ localPath: manifestPath, r2Key: 'data/manifest.json' }];
}
