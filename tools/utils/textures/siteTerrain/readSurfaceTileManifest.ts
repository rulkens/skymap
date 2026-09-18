import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { SurfaceTileManifest } from '../../../../src/@types/scene/SurfaceTileManifest';
import { SURFACE_TILE_REGISTRY } from '../../../../src/data/bodies/surfaceTileRegistry';

/** readSurfaceTileManifest — a host's locally baked tile manifest; throws when
 *  the host has no tile pyramid or has not been baked here. */
export function readSurfaceTileManifest(hostId: string): SurfaceTileManifest {
  const registry = SURFACE_TILE_REGISTRY as Record<string, { manifestKey: string } | undefined>;
  const key = registry[hostId]?.manifestKey;
  if (key === undefined) {
    throw new Error(`readSurfaceTileManifest: '${hostId}' has no SURFACE_TILE_REGISTRY row`);
  }
  const path = resolve(`public/data/images/${key}/manifest.json`);
  if (!existsSync(path)) {
    throw new Error(`readSurfaceTileManifest: no manifest at ${path} — bake '${hostId}' first`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as SurfaceTileManifest;
}
