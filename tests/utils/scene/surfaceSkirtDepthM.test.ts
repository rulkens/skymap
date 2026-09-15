/**
 * Regression: the skirt-depth heuristic is a fraction of the PATCH's height,
 * so it grows without bound as levels get shallower — at z3 (the coarsest leaf
 * a `small`-tier session draws, spanning 45°) it asked for a 250 km wall. Any
 * patch edge whose neighbour has not landed draws that wall, and at 4G tile
 * rates on mobile there are always such edges: flat sheets hundreds of km long
 * over an otherwise-correct globe, with the hole they border invisible (the
 * base globe sits only 430 m under the datum).
 */
import { describe, expect, it } from 'vitest';

import { SURFACE_TILE_SKIRT_DEPTH_FRACTION } from '../../../src/data/bodies/earthTileParams';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { reliefSpanM } from '../../../src/utils/scene/reliefSpanM';
import { surfaceSkirtDepthM } from '../../../src/utils/scene/surfaceSkirtDepthM';

const EARTH_RADIUS_M = SCENE_EARTH.surface.datumRadiusM;
const EARTH_RELIEF_SPAN_M = reliefSpanM(SCENE_EARTH.surface);

/** Latitude span of one tile at pyramid level `z`: 180° over `1 << (z - 1)` rows. */
function tileDLatRad(z: number): number {
  return Math.PI / (1 << (z - 1));
}

describe('surfaceSkirtDepthM', () => {
  it('caps the shallow levels the uncapped heuristic blew past', () => {
    // z3..z5 are what baseLevel 2/3/4 (small/medium/large) draw as their
    // coarsest leaf — the regime the 15.6 km-at-z7 heuristic was never sized for.
    for (const z of [3, 4, 5]) {
      const dLatRad = tileDLatRad(z);
      const uncapped = SURFACE_TILE_SKIRT_DEPTH_FRACTION * EARTH_RADIUS_M * dLatRad;
      expect(uncapped).toBeGreaterThan(EARTH_RELIEF_SPAN_M);
      expect(surfaceSkirtDepthM(EARTH_RADIUS_M, dLatRad, EARTH_RELIEF_SPAN_M)).toBe(
        EARTH_RELIEF_SPAN_M,
      );
    }
    // The z3 wall the screenshots caught, stated in the unit that made it a bug.
    expect(SURFACE_TILE_SKIRT_DEPTH_FRACTION * EARTH_RADIUS_M * tileDLatRad(3)).toBeGreaterThan(
      200_000,
    );
  });

  it('leaves the deep levels the heuristic was tuned on untouched', () => {
    // Earth's span is 9.3 km, which the fraction drops under at z8 (7.8 km) —
    // so every level a close approach actually draws keeps the tuned value.
    for (const z of [9, 13, 19]) {
      const dLatRad = tileDLatRad(z);
      expect(surfaceSkirtDepthM(EARTH_RADIUS_M, dLatRad, EARTH_RELIEF_SPAN_M)).toBeCloseTo(
        SURFACE_TILE_SKIRT_DEPTH_FRACTION * EARTH_RADIUS_M * dLatRad,
        6,
      );
    }
  });
});
