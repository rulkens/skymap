/**
 * earthTileBandRequestAllowed — "does any band overlapping this uv actually
 * bake a file at z?" Guards both the leaf branch and the ancestor-request
 * gate in `cutSurfaceTiles`: a level a band's own min/max range doesn't cover
 * has no file, however much the walk wants to refine there.
 */
import { describe, it, expect } from 'vitest';

import { earthTileBandRequestAllowed } from '../../../src/utils/scene/earthTileBandRequestAllowed';
import type { EarthTileBand } from '../../../src/@types/scene/EarthTileBand';

const uv = (u0: number, u1: number, v0: number, v1: number) => [u0, u1, v0, v1] as const;

describe('earthTileBandRequestAllowed', () => {
  it('is true inside a band [min, max] and false outside it', () => {
    const band: EarthTileBand = { uBounds: [0.2, 0.8], vBounds: [0.2, 0.8], min: 3, max: 7 };
    const inside = uv(0.4, 0.5, 0.4, 0.5);
    expect(earthTileBandRequestAllowed([band], 3, ...inside)).toBe(true);
    expect(earthTileBandRequestAllowed([band], 7, ...inside)).toBe(true);
    expect(earthTileBandRequestAllowed([band], 2, ...inside)).toBe(false);
    expect(earthTileBandRequestAllowed([band], 8, ...inside)).toBe(false);
  });

  it('a regional band supplies files only inside its own bbox, at its own depth', () => {
    const world: EarthTileBand = { uBounds: [0, 1], vBounds: [0, 1], min: 3, max: 7 };
    const regional: EarthTileBand = {
      uBounds: [0.53, 0.54],
      vBounds: [0.8, 0.81],
      min: 8,
      max: 13,
    };
    const bands = [world, regional];

    const insideRegional = uv(0.535, 0.536, 0.805, 0.806);
    expect(earthTileBandRequestAllowed(bands, 10, ...insideRegional)).toBe(true);

    // Same z, but outside the regional bbox: only the world band overlaps,
    // and its max (7) doesn't reach z = 10.
    const outsideRegional = uv(0.1, 0.11, 0.1, 0.11);
    expect(earthTileBandRequestAllowed(bands, 10, ...outsideRegional)).toBe(false);
    expect(earthTileBandRequestAllowed(bands, 5, ...outsideRegional)).toBe(true);
  });

  it('an antimeridian-split band pair is seen as covered by whichever side the query overlaps', () => {
    const east: EarthTileBand = { uBounds: [0.9, 1], vBounds: [0, 1], min: 8, max: 13 };
    const west: EarthTileBand = { uBounds: [0, 0.1], vBounds: [0, 1], min: 8, max: 13 };
    const bands = [east, west];

    const eastOfSeam = uv(0.95, 0.99, 0.4, 0.5);
    expect(earthTileBandRequestAllowed(bands, 10, ...eastOfSeam)).toBe(true);

    const westOfSeam = uv(0.01, 0.05, 0.4, 0.5);
    expect(earthTileBandRequestAllowed(bands, 10, ...westOfSeam)).toBe(true);

    const farFromSeam = uv(0.45, 0.49, 0.4, 0.5);
    expect(earthTileBandRequestAllowed(bands, 10, ...farFromSeam)).toBe(false);
  });
});
