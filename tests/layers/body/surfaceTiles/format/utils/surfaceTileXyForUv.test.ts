/**
 * surfaceTileXyForUv — the mesh-uv to tile-grid conversion, pinned to hand-computed tiles.
 *
 * Level z has 2^z columns and 2^(z-1) rows at 512 px tiles. Expected tiles are
 * written out literally from tile centres (u = (x + 0.5) / cols, v = 1 - (y + 0.5) / rows),
 * so an off-by-one in the `1 - v` south-first flip or in the `cols / 2` row count samples
 * the wrong latitude band, which on a globe reads as "subtly wrong" rather than as a
 * break a visual pass would catch.
 *
 * The wrap/clamp asymmetry gets its own cases because treating longitude and
 * latitude identically is the classic plate-carrée bug.
 */

import { describe, it, expect } from 'vitest';

import { surfaceTileColumns } from '../../../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileColumns';
import { surfaceTileXyForUv } from '../../../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileXyForUv';
import { SURFACE_TILE_PX } from '../../../../../../src/layers/body/surfaceTiles/format/data/surfaceTileParams';

describe('surfaceTileXyForUv', () => {
  it('maps the corner, antimeridian and mid-grid tile centres at level 5 (32 x 16 tiles)', () => {
    const cases: ReadonlyArray<readonly [number, number, number, number, string]> = [
      [0.5 / 32, 1 - 0.5 / 16, 0, 0, 'north-west'],
      [31.5 / 32, 1 - 0.5 / 16, 31, 0, 'north-east'],
      [0.5 / 32, 1 - 15.5 / 16, 0, 15, 'south-west'],
      [31.5 / 32, 1 - 15.5 / 16, 31, 15, 'south-east'],
      [16.5 / 32, 1 - 8.5 / 16, 16, 8, 'prime meridian, equator'],
      [31.5 / 32, 1 - 8.5 / 16, 31, 8, 'antimeridian, mid-latitude'],
      [1.5 / 32, 1 - 1.5 / 16, 1, 1, 'one in from the north-west'],
    ];
    for (const [u, v, x, y, label] of cases) {
      expect(surfaceTileXyForUv([u, v], 5, SURFACE_TILE_PX), label).toEqual([x, y]);
    }
  });

  it('maps the corner tile centres at level 13 (8192 x 4096 tiles)', () => {
    const cases: ReadonlyArray<readonly [number, number, number, number, string]> = [
      [0.5 / 8192, 1 - 0.5 / 4096, 0, 0, 'north-west'],
      [8191.5 / 8192, 1 - 0.5 / 4096, 8191, 0, 'north-east'],
      [0.5 / 8192, 1 - 4095.5 / 4096, 0, 4095, 'south-west'],
      [8191.5 / 8192, 1 - 4095.5 / 4096, 8191, 4095, 'south-east'],
    ];
    for (const [u, v, x, y, label] of cases) {
      expect(surfaceTileXyForUv([u, v], 13, SURFACE_TILE_PX), label).toEqual([x, y]);
    }
  });

  it('puts u=0 at column 0 and v=0 at the southernmost row (the mesh is south-first)', () => {
    // Not a restatement of the formula: this is the ONE place the two conventions
    // are asserted against each other in absolute terms rather than relatively.
    // `cubeSphereMesh` bakes v=0 as the SOUTH pole; tile row 0 is the NORTH edge.
    const z = 5;
    const rows = surfaceTileColumns(z, SURFACE_TILE_PX) / 2;
    expect(surfaceTileXyForUv([0, 0], z, SURFACE_TILE_PX)).toEqual([0, rows - 1]);
    expect(surfaceTileXyForUv([0, 1], z, SURFACE_TILE_PX)).toEqual([0, 0]);
  });

  it('wraps longitude but clamps latitude', () => {
    const z = 5;
    const cols = surfaceTileColumns(z, SURFACE_TILE_PX);
    const rows = cols / 2;
    // u past the antimeridian comes back round to column 0, the same wrap the
    // fragment's `fract` applies.
    expect(surfaceTileXyForUv([1, 0.5], z, SURFACE_TILE_PX)[0]).toBe(0);
    expect(surfaceTileXyForUv([1.25, 0.5], z, SURFACE_TILE_PX)[0]).toBe(cols / 4);
    expect(surfaceTileXyForUv([-0.25, 0.5], z, SURFACE_TILE_PX)[0]).toBe((cols * 3) / 4);
    // v off the top or bottom of the world is not periodic — it stops at the pole.
    expect(surfaceTileXyForUv([0.5, 1.5], z, SURFACE_TILE_PX)[1]).toBe(0);
    expect(surfaceTileXyForUv([0.5, -0.5], z, SURFACE_TILE_PX)[1]).toBe(rows - 1);
  });
});
