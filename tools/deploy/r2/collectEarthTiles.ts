import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { R2Upload } from './R2Upload';

/**
 * The baked Earth virtual-texture tiles, enumerated from
 * `earth-tiles/index.txt` rather than walked off disk: a walk would also
 * pick up stray `.DS_Store` files, and the index is written last by the
 * bake, so an interrupted bake leaves no index and this correctly uploads
 * nothing instead of a partial tile set.
 */
export function collectEarthTiles(imagesDir: string): R2Upload[] {
  const indexPath = join(imagesDir, 'earth-tiles', 'index.txt');
  if (!existsSync(indexPath)) return [];
  return readFileSync(indexPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({
      localPath: join(imagesDir, line),
      r2Key: `data/images/${line}`,
    }));
}
