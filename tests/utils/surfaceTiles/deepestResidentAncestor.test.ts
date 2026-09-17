/**
 * The floor is the off-by-one this shared climb can silently move: `minLevel`
 * is strict, so a base-level tile must never resolve. The happy path is
 * covered through the callers in `cutSurfaceTiles.test.ts`.
 */

import { describe, it, expect } from 'vitest';

import { deepestResidentAncestor } from '../../../src/utils/surfaceTiles/deepestResidentAncestor';
import type { SurfaceTileId } from '../../../src/@types/data/SurfaceTileId';

const BASE_LEVEL = 4;

describe('deepestResidentAncestor', () => {
  it('stops at minLevel', () => {
    const probed: number[] = [];
    const found = deepestResidentAncestor(
      { product: 'height', z: 8, x: 300, y: 111 },
      BASE_LEVEL,
      (tile: SurfaceTileId) => {
        probed.push(tile.z);
        return tile.z === BASE_LEVEL ? { slot: 1 } : null;
      },
    );
    expect(found).toBeNull();
    expect(probed).toEqual([8, 7, 6, 5]);
  });
});
