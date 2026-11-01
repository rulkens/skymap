/**
 * derivePlannerParams — the manifest validation the tile planner stands on.
 * A bake at another tile edge resolves every tile to a wrong-sized atlas rect
 * with no error and a picture that still looks like Earth, so it must be a
 * refusal (base-only), and the accepted default must still be accepted.
 */

import { describe, expect, it } from 'vitest';

import type { SurfaceTileManifest } from '../../../../../src/@types/scene/SurfaceTileManifest';
import { derivePlannerParams } from '../../../../../src/layers/body/subsystems/surfaceTiles/derivePlannerParams';
import { SURFACE_TILE_PX } from '../../../../../src/data/bodies/surfaceTileParams';

const BASE_LEVEL = 4;
const PROVENANCE = { sourceId: 'test', attribution: 'test', vintage: 'test' };
const WORLD = { west: -180, south: -90, east: 180, north: 90 };
const BAND = {
  bounds: WORLD,
  min: 2,
  max: BASE_LEVEL + 2,
  builtFrom: { albedo: PROVENANCE, height: PROVENANCE },
};

function manifest(over: Partial<SurfaceTileManifest> = {}): SurfaceTileManifest {
  return { prefix: 'earth-tiles/v8', tilePx: SURFACE_TILE_PX, bands: [BAND], ...over };
}

describe('derivePlannerParams', () => {
  it('accepts a bake at the format tile edge, and one that omits the field', () => {
    expect(derivePlannerParams(manifest(), BASE_LEVEL)).not.toBeNull();
    const { tilePx: _omitted, ...withoutEdge } = manifest();
    expect(derivePlannerParams(withoutEdge as SurfaceTileManifest, BASE_LEVEL)).not.toBeNull();
  });

  it('refuses a bake cut at a different tile edge rather than adapting to it', () => {
    expect(derivePlannerParams(manifest({ tilePx: SURFACE_TILE_PX / 2 }), BASE_LEVEL)).toBeNull();
    expect(derivePlannerParams(manifest({ tilePx: SURFACE_TILE_PX * 2 }), BASE_LEVEL)).toBeNull();
  });

  it('skips a malformed band and derives params from the good ones', () => {
    const params = derivePlannerParams(
      manifest({ bands: [{ ...BAND, bounds: undefined as never }, BAND] }),
      BASE_LEVEL,
    );
    expect(params?.bands).toHaveLength(1);
  });

  it('skips a band with no baked height, rather than requesting tiles that 404', () => {
    const albedoOnly = { ...BAND, builtFrom: { albedo: PROVENANCE } };
    expect(derivePlannerParams(manifest({ bands: [albedoOnly] }), BASE_LEVEL)).toBeNull();
  });

  it('floors every band one level finer than the base it is given', () => {
    // At or above the base the whole-globe texture already carries the detail:
    // a request there re-downloads it, and a tier swap must move the floor too.
    expect(derivePlannerParams(manifest(), BASE_LEVEL)?.bands[0]?.min).toBe(BASE_LEVEL + 1);
    expect(derivePlannerParams(manifest(), BASE_LEVEL - 1)?.bands[0]?.min).toBe(BASE_LEVEL);
    expect(derivePlannerParams(manifest(), BASE_LEVEL + 2)).toBeNull();
  });
});
