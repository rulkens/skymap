/**
 * The sub-rect arithmetic is the whole file: a leaf drawing an ancestor's
 * posts at the wrong origin displaces its terrain by up to a tile and nothing
 * in F1 can see it (no consumer yet). Hand-computed block indices below, never
 * the source's own expression.
 */

import { describe, it, expect } from 'vitest';

import { resolveHeightLattice } from '../../../src/utils/scene/resolveHeightLattice';
import type { SurfaceTileId } from '../../../src/@types/data/SurfaceTileId';

const BASE_LEVEL = 4;

/** Height resident at exactly `z`, albedo never (the walk's other product must
 *  not resolve a height lattice by accident). */
function residentAt(z: number, slot = 3) {
  return (tile: SurfaceTileId) => (tile.product === 'height' && tile.z === z ? { slot } : null);
}

describe('resolveHeightLattice', () => {
  it("resolves the leaf's own tile at levelDelta 0, whole-tile sub-rect", () => {
    const height = resolveHeightLattice({
      z: 9,
      x: 300,
      y: 111,
      baseLevel: BASE_LEVEL,
      minLevelDelta: 0,
      residentSlot: residentAt(9, 12),
    });
    expect(height).toEqual({ slot: 12, levelDelta: 0, originPosts: [0, 0] });
  });

  it('climbs to the deepest resident ancestor and flattens the leaf into its posts', () => {
    // z9 leaf on a z6 tile: a 8 x 8 block of leaves over 128 cells, so each
    // leaf owns 16 posts. 300 = 37 * 8 + 4, 111 = 13 * 8 + 7.
    const height = resolveHeightLattice({
      z: 9,
      x: 300,
      y: 111,
      baseLevel: BASE_LEVEL,
      minLevelDelta: 0,
      residentSlot: residentAt(6),
    });
    expect(height).toEqual({ slot: 3, levelDelta: 3, originPosts: [4 * 16, 7 * 16] });
  });

  it('starts the climb at minLevelDelta, skipping a resident deeper tile', () => {
    const residentSlot = (tile: SurfaceTileId) =>
      tile.product === 'height' && (tile.z === 9 || tile.z === 7) ? { slot: tile.z } : null;
    const height = resolveHeightLattice({
      z: 9,
      x: 300,
      y: 111,
      baseLevel: BASE_LEVEL,
      minLevelDelta: 1,
      residentSlot,
    });
    // z8 is not resident either, so the climb runs past the requested level.
    expect(height).toEqual({ slot: 7, levelDelta: 2, originPosts: [0 * 32, 3 * 32] });
  });

  it('never resolves at or shallower than baseLevel', () => {
    expect(
      resolveHeightLattice({
        z: 9,
        x: 300,
        y: 111,
        baseLevel: BASE_LEVEL,
        minLevelDelta: 0,
        residentSlot: residentAt(BASE_LEVEL),
      }),
    ).toBeNull();
  });
});
