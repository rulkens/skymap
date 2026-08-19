/**
 * earthTileBandRefineAllowed — "does any band overlapping this uv permit
 * refining past z?" The load-bearing case is the Copenhagen shape: a deep
 * regional band must not let refinement past the shallow world band's max
 * happen OUTSIDE the regional bbox, or every leaf on Earth would try to
 * refine to the deepest band's level regardless of coverage.
 */
import { describe, it, expect } from 'vitest';

import { earthTileBandRefineAllowed } from '../../../src/utils/scene/earthTileBandRefineAllowed';
import type { EarthTileBand } from '../../../src/@types/scene/EarthTileBand';

const uv = (u0: number, u1: number, v0: number, v1: number) => [u0, u1, v0, v1] as const;

describe('earthTileBandRefineAllowed', () => {
  it('permits refinement inside a band while z is shallower than its max, and stops at max', () => {
    const band: EarthTileBand = { uBounds: [0.2, 0.8], vBounds: [0.2, 0.8], min: 3, max: 7 };
    const inside = uv(0.4, 0.5, 0.4, 0.5);
    expect(earthTileBandRefineAllowed([band], 6, ...inside)).toBe(true);
    expect(earthTileBandRefineAllowed([band], 7, ...inside)).toBe(false);
  });

  it('a deep regional band only permits refinement past the world band inside its own bbox', () => {
    const world: EarthTileBand = { uBounds: [0, 1], vBounds: [0, 1], min: 3, max: 7 };
    // Copenhagen sits east of the prime meridian and north of the equator.
    const regional: EarthTileBand = {
      uBounds: [0.53, 0.54],
      vBounds: [0.8, 0.81],
      min: 8,
      max: 13,
    };
    const bands = [world, regional];

    const insideRegional = uv(0.535, 0.536, 0.805, 0.806);
    expect(earthTileBandRefineAllowed(bands, 10, ...insideRegional)).toBe(true);

    const outsideRegional = uv(0.1, 0.11, 0.1, 0.11);
    expect(earthTileBandRefineAllowed(bands, 10, ...outsideRegional)).toBe(false);
  });

  it('an antimeridian-split band pair is seen as covered by whichever side the query overlaps', () => {
    const east: EarthTileBand = { uBounds: [0.9, 1], vBounds: [0, 1], min: 8, max: 13 };
    const west: EarthTileBand = { uBounds: [0, 0.1], vBounds: [0, 1], min: 8, max: 13 };
    const bands = [east, west];

    const eastOfSeam = uv(0.95, 0.99, 0.4, 0.5);
    expect(earthTileBandRefineAllowed(bands, 10, ...eastOfSeam)).toBe(true);

    const westOfSeam = uv(0.01, 0.05, 0.4, 0.5);
    expect(earthTileBandRefineAllowed(bands, 10, ...westOfSeam)).toBe(true);

    const farFromSeam = uv(0.45, 0.49, 0.4, 0.5);
    expect(earthTileBandRefineAllowed(bands, 10, ...farFromSeam)).toBe(false);
  });
});
