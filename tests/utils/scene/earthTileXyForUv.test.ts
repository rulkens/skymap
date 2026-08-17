/**
 * earthTileXyForUv / earthTileCentreUv — the mesh-uv ⇔ tile-grid conversion pair.
 *
 * Spec test 1. This is a ROUND TRIP, not a mirror: the two functions are written
 * as independent formulas (see `earthTileXyForUv`'s header), so composing them
 * exercises both the `1 - v` south-first flip and the `columns / 2` row count.
 * An off-by-one in either samples the wrong latitude band, which on a globe reads
 * as "the texture is subtly wrong" rather than as an obvious break — precisely
 * the kind of fault a visual pass can miss and a round trip cannot.
 *
 * The wrap/clamp asymmetry gets its own cases because treating longitude and
 * latitude identically is the classic plate-carrée bug.
 */

import { describe, it, expect } from 'vitest';

import { earthTileCentreUv } from '../../../src/utils/scene/earthTileCentreUv';
import { earthTileColumns } from '../../../src/utils/scene/earthTileColumns';
import { earthTileXyForUv } from '../../../src/utils/scene/earthTileXyForUv';
import { EARTH_TILE_PX } from '../../../src/data/bodies/earthTileParams';

/** Levels 5 (the shallowest the virtual texture requests) through 13 (the
 *  deepest either candidate source carries real detail at). */
const LEVELS = [5, 6, 7, 8, 9, 10, 11, 12, 13];

describe('earthTileXyForUv / earthTileCentreUv', () => {
  it('round-trips every corner, the antimeridian column and the mid-grid, at levels 5 to 13', () => {
    for (const z of LEVELS) {
      const cols = earthTileColumns(z, EARTH_TILE_PX);
      const rows = cols / 2;
      const probes: ReadonlyArray<readonly [number, number]> = [
        [0, 0], // north-west: longitude -180, latitude +90
        [cols - 1, 0], // north-east
        [0, rows - 1], // south-west
        [cols - 1, rows - 1], // south-east
        [cols / 2, rows / 2], // the prime meridian / equator corner
        [cols - 1, rows / 2], // the antimeridian, mid-latitude
        [1, 1],
        [cols - 2, rows - 2],
      ];
      for (const [x, y] of probes) {
        const uv = earthTileCentreUv([x, y], z, EARTH_TILE_PX);
        expect(earthTileXyForUv(uv, z, EARTH_TILE_PX), `z${z} tile ${x},${y}`).toEqual([x, y]);
      }
    }
  });

  it('puts u=0 at column 0 and v=0 at the southernmost row (the mesh is south-first)', () => {
    // Not a restatement of the formula: this is the ONE place the two conventions
    // are asserted against each other in absolute terms rather than relatively.
    // `cubeSphereMesh` bakes v=0 as the SOUTH pole; tile row 0 is the NORTH edge.
    const z = 5;
    const rows = earthTileColumns(z, EARTH_TILE_PX) / 2;
    expect(earthTileXyForUv([0, 0], z, EARTH_TILE_PX)).toEqual([0, rows - 1]);
    expect(earthTileXyForUv([0, 1], z, EARTH_TILE_PX)).toEqual([0, 0]);
  });

  it('wraps longitude but clamps latitude', () => {
    const z = 5;
    const cols = earthTileColumns(z, EARTH_TILE_PX);
    const rows = cols / 2;
    // u past the antimeridian comes back round to column 0, the same wrap the
    // fragment's `fract` applies.
    expect(earthTileXyForUv([1, 0.5], z, EARTH_TILE_PX)[0]).toBe(0);
    expect(earthTileXyForUv([1.25, 0.5], z, EARTH_TILE_PX)[0]).toBe(cols / 4);
    expect(earthTileXyForUv([-0.25, 0.5], z, EARTH_TILE_PX)[0]).toBe((cols * 3) / 4);
    // v off the top or bottom of the world is not periodic — it stops at the pole.
    expect(earthTileXyForUv([0.5, 1.5], z, EARTH_TILE_PX)[1]).toBe(0);
    expect(earthTileXyForUv([0.5, -0.5], z, EARTH_TILE_PX)[1]).toBe(rows - 1);
  });
});
