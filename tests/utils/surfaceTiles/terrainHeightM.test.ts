/**
 * The shared-post case is the real guard here (F1): child tile (2,2) at z3
 * is the NW quadrant of parent tile (1,1) at z2, so child post (6,10) and
 * parent post (3,5) name the SAME ground point (strict decimation, R1). Every
 * OTHER post is independent noise, so a wrong ×17 divisor (misses the post,
 * blends in an unrelated neighbour) or a flipped grid row (reads a different
 * post outright) makes the two levels disagree — an affine field would not
 * expose either, since bilinear reconstruction of one is scale-invariant.
 */

import { describe, expect, it } from 'vitest';

import type { SurfaceTileId } from '../../../src/@types/data/SurfaceTileId';
import type { HeightTileHeader } from '../../../src/@types/scene/HeightTileHeader';
import { equirectUvToDirection } from '../../../src/utils/math/equirectUvToDirection';
import {
  HEIGHT_CODE_BYTES,
  HEIGHT_CODE_MAX,
  HEIGHT_GRID_BYTES,
  HEIGHT_GRID_POSTS_PER_EDGE,
} from '../../../src/data/scene/heightTileFormat';
import { mulberry32 } from '../../../src/utils/random/mulberry32';
import { codeHeightM } from '../../../src/utils/surfaceTiles/codeHeightM';
import { terrainHeightM } from '../../../src/utils/surfaceTiles/terrainHeightM';

const BASE_LEVEL = 0;

function postOffset(col: number, row: number): number {
  return (row * HEIGHT_GRID_POSTS_PER_EDGE + col) * HEIGHT_CODE_BYTES;
}

function setPost(gridCodes: Uint8Array, col: number, row: number, code: number): void {
  const offset = postOffset(col, row);
  gridCodes[offset] = (code >> 16) & 0xff;
  gridCodes[offset + 1] = (code >> 8) & 0xff;
  gridCodes[offset + 2] = code & 0xff;
}

function readPost(gridCodes: Uint8Array, col: number, row: number): number {
  const offset = postOffset(col, row);
  return (gridCodes[offset]! << 16) | (gridCodes[offset + 1]! << 8) | gridCodes[offset + 2]!;
}

function headerFromCodes(codeAt: (col: number, row: number) => number): HeightTileHeader {
  const gridCodes = new Uint8Array(HEIGHT_GRID_BYTES);
  for (let row = 0; row < HEIGHT_GRID_POSTS_PER_EDGE; row++) {
    for (let col = 0; col < HEIGHT_GRID_POSTS_PER_EDGE; col++) {
      setPost(gridCodes, col, row, codeAt(col, row));
    }
  }
  return { subtreeMinM: 0, subtreeMaxM: 0, geometricResidualM: 0, gridCodes };
}

const uniformHeader = (code: number): HeightTileHeader => headerFromCodes(() => code);

/** Deterministic noise, distinct per post and per seed — no accidental slope
 *  between neighbours for a wrong divisor's blend to reconstruct by luck. */
function noisyHeader(seed: number): HeightTileHeader {
  const rand = mulberry32(seed);
  return headerFromCodes(() => Math.floor(rand() * (HEIGHT_CODE_MAX + 1)));
}

describe('terrainHeightM', () => {
  it('falls back to the deepest resident ancestor', () => {
    // dir [1,0,0] is lon 0, lat 0 → u 0.5, v 0.5: z4 leaf (8, 4), z3 ancestor (4, 2).
    const leaf: SurfaceTileId = { product: 'height', z: 4, x: 8, y: 4 };
    const ancestor: SurfaceTileId = { product: 'height', z: 3, x: 4, y: 2 };
    const header = uniformHeader(12_345);
    const resident = (tile: SurfaceTileId): HeightTileHeader | null => {
      if (tile.product !== 'height') return null;
      if (tile.z === leaf.z && tile.x === leaf.x && tile.y === leaf.y) return null;
      if (tile.z === ancestor.z && tile.x === ancestor.x && tile.y === ancestor.y) return header;
      return null;
    };
    expect(terrainHeightM([1, 0, 0], 4, BASE_LEVEL, resident)).toBe(codeHeightM(12_345));
  });

  it('returns exactly 0 when no ancestor is resident', () => {
    const result = terrainHeightM([1, 0, 0], 4, BASE_LEVEL, () => null);
    expect(Object.is(result, 0)).toBe(true);
  });

  it('returns 0 for a zero direction vector', () => {
    // Reachable in production (flooredBodyPose.ts, toWorldArm, hostedFocusOverHorizon);
    // `resident` throwing pins that the zero guard fires before any lookup, not after.
    const resident = (): HeightTileHeader | null => {
      throw new Error('must not probe residency for a zero direction');
    };
    const result = terrainHeightM([0, 0, 0], 4, BASE_LEVEL, resident);
    expect(Object.is(result, 0)).toBe(true);
  });

  it('returns 0 for a non-finite direction vector', () => {
    // A `magM === 0` guard lets these straight through: they survive
    // `atan2`/`asin` as NaN and end up in the camera position, which is the
    // same black-screen-with-no-error the zero guard exists to prevent.
    const resident = (): HeightTileHeader | null => {
      throw new Error('must not probe residency for a non-finite direction');
    };
    for (const dir of [
      [Number.NaN, 0, 0],
      [Infinity, 0, 0],
      [0, -Infinity, 1],
    ] as const) {
      const result = terrainHeightM(dir, 4, BASE_LEVEL, resident);
      expect(Object.is(result, 0)).toBe(true);
    }
  });

  it('reads a shared post identically from both levels', () => {
    const childHeader = noisyHeader(1);
    const parentHeader = noisyHeader(2);
    // The ONE fact strict decimation guarantees: child post (6, 10) IS parent
    // post (3, 5) — child tile (2, 2) is exactly parent tile (1, 1)'s NW
    // quadrant, so child col/row 2k lines up with parent col/row k.
    setPost(parentHeader.gridCodes, 3, 5, readPost(childHeader.gridCodes, 6, 10));

    // Land exactly on that post: col 6 of 16 cells (0.375 of the child tile),
    // row 10 of 16 (0.625) — asymmetric on both axes so a col/row swap, or a
    // north/south flip landing on a DIFFERENT (noise) post, cannot hide.
    const u = (2 + 6 / 16) / 8; // z3 has 8 columns
    const v = 1 - (2 + 10 / 16) / 4; // z3 has 4 rows; row 0 is north, so `1 -`
    const dirBodyFixed = equirectUvToDirection([u, v]);

    const viaChild = terrainHeightM(dirBodyFixed, 3, BASE_LEVEL, (tile) =>
      tile.product === 'height' && tile.z === 3 && tile.x === 2 && tile.y === 2
        ? childHeader
        : null,
    );
    const viaParent = terrainHeightM(dirBodyFixed, 3, BASE_LEVEL, (tile) =>
      tile.product === 'height' && tile.z === 2 && tile.x === 1 && tile.y === 1
        ? parentHeader
        : null,
    );
    expect(viaChild).toBeCloseTo(viaParent, 6);
    // Pins it against the noise, not just against each other: a shared bug
    // that happens to move both readings the same way would still pass above.
    expect(viaChild).toBeCloseTo(codeHeightM(readPost(childHeader.gridCodes, 6, 10)), 6);
  });
});
