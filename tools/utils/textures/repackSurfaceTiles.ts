import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SurfaceTileManifest } from '../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifest';
import { packSurfaceTileLevels } from './packSurfaceTileLevels';

/**
 * repackSurfaceTiles — packs the loose tiles a body's last bake listed in its
 * `index.txt`, under the prefix its `manifest.json` names, and touches nothing
 * else. It exists because `body.bands()` reads source rasters, which a re-pack
 * of tiles already on disk must not need. Returns the archive files written.
 */
export function repackSurfaceTiles(outDir: string, tileRoot: string): number {
  const manifestPath = join(outDir, tileRoot, 'manifest.json');
  const indexPath = join(outDir, tileRoot, 'index.txt');
  for (const path of [manifestPath, indexPath]) {
    if (!existsSync(path)) throw new Error(`repackSurfaceTiles: ${path} is missing — bake first`);
  }
  const { prefix } = JSON.parse(readFileSync(manifestPath, 'utf8')) as SurfaceTileManifest;
  const paths = readFileSync(indexPath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
  return packSurfaceTileLevels(outDir, prefix, paths);
}
