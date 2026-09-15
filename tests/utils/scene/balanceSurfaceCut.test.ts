/**
 * The 2:1 balance is what bounds `edgeCoarser` to one bit per edge, and one
 * bit is the whole stitching budget F2's vertex stage gets (spec §6.2). A cut
 * that slips to a two-level step, or a bit set on the wrong edge, is invisible
 * in F1 — nothing reads either — and shows up later as a crack nobody can tie
 * back to the walk. Hand-built cuts, because the interesting shapes (a deep
 * island beside a coarse neighbour, the antimeridian seam) are ones a camera
 * fixture reaches only by accident.
 */

import { describe, it, expect } from 'vitest';

import { balanceSurfaceCut } from '../../../src/utils/scene/balanceSurfaceCut';
import { surfaceTileColumns } from '../../../src/utils/scene/surfaceTileColumns';
import { EARTH_TILE_PX } from '../../../src/data/bodies/earthTileParams';
import type { SurfaceCutTile } from '../../../src/@types/scene/SurfaceCutTile';
import type { SurfaceTileBand } from '../../../src/@types/scene/SurfaceTileBand';

function leafAt(z: number, x: number, y: number): SurfaceCutTile {
  return {
    id: { z, x, y },
    anchor: { lon0Rad: 0, lat0Rad: 0, dLonRad: 0, dLatRad: 0 },
    albedo: {
      slot: 0,
      atlasUvOrigin: [0, 0],
      atlasUvScale: [1, 1],
      readyAtMs: 0,
      fallback: null,
    },
    heightSlot: z,
    edgeCoarser: [0, 0, 0, 0],
  };
}

/** Every parent is emittable — the case the contract describes (a parent's
 *  height tile is resident by construction, since it is what let the walk
 *  refine past it). */
const alwaysEmittable = (z: number, x: number, y: number) => leafAt(z, x, y);

/** One whole-globe band deep enough that nothing below is band-capped — the
 *  case every pre-R12 test was written against. */
const UNCAPPED: readonly SurfaceTileBand[] = [
  { uBounds: [0, 1], vBounds: [0, 1], min: 0, max: 30 },
];

function balance(
  cut: readonly SurfaceCutTile[],
  bands: readonly SurfaceTileBand[] = UNCAPPED,
  resolveParent: (z: number, x: number, y: number) => SurfaceCutTile | null = alwaysEmittable,
) {
  return balanceSurfaceCut(cut, EARTH_TILE_PX, bands, resolveParent);
}

function find(cut: readonly SurfaceCutTile[], z: number, x: number, y: number) {
  return cut.find((t) => t.id.z === z && t.id.x === x && t.id.y === y);
}

/** The coarsest leaf covering cell `(z, x, y)`, the way the balance itself
 *  resolves neighbours — recomputed here so the assertions below are a second
 *  statement of the invariant rather than a call into the code under test. */
function coveringLevel(cut: readonly SurfaceCutTile[], z: number, x: number, y: number) {
  for (const tile of cut) {
    const delta = z - tile.id.z;
    if (delta < 0) continue;
    if (x >> delta === tile.id.x && y >> delta === tile.id.y) return tile.id.z;
  }
  return null;
}

/** Largest level step across any edge-neighbouring pair of leaves. */
function worstStep(cut: readonly SurfaceCutTile[]): number {
  let worst = 0;
  for (const tile of cut) {
    const { z, x, y } = tile.id;
    const cols = surfaceTileColumns(z, EARTH_TILE_PX);
    const rows = cols / 2;
    const cells: ReadonlyArray<readonly [number, number] | null> = [
      [x === 0 ? cols - 1 : x - 1, y],
      [x === cols - 1 ? 0 : x + 1, y],
      y + 1 < rows ? [x, y + 1] : null,
      y > 0 ? [x, y - 1] : null,
    ];
    for (const cell of cells) {
      if (cell === null) continue;
      const other = coveringLevel(cut, z, cell[0], cell[1]);
      if (other !== null && z - other > worst) worst = z - other;
    }
  }
  return worst;
}

describe('balanceSurfaceCut', () => {
  it('collapses a leaf quad two levels finer than its edge neighbour', () => {
    // One z8 leaf, and the four z10 siblings sharing its east edge — the
    // two-level step the vertex stage cannot stitch.
    const cut = [
      leafAt(8, 10, 5),
      leafAt(10, 44, 20),
      leafAt(10, 45, 20),
      leafAt(10, 44, 21),
      leafAt(10, 45, 21),
    ];
    expect(worstStep(cut), 'the fixture really is out of balance').toBe(2);

    const balanced = balance(cut);

    expect(worstStep(balanced)).toBeLessThanOrEqual(1);
    expect(balanced.some((t) => t.id.z === 10)).toBe(false);
    expect(find(balanced, 9, 22, 10), 'the four siblings became their parent').toBeDefined();
    // Coarsening only: the z8 neighbour is untouched, never refined to meet it.
    expect(find(balanced, 8, 10, 5)).toBeDefined();
  });

  it('sets edgeCoarser on the one edge facing a coarser neighbour', () => {
    // A z8 leaf with the four z9 leaves of the tile due east of it: only the
    // two western z9 leaves face it, and only on their west edge.
    const cut = [
      leafAt(8, 10, 5),
      leafAt(9, 22, 10),
      leafAt(9, 23, 10),
      leafAt(9, 22, 11),
      leafAt(9, 23, 11),
    ];

    const balanced = balance(cut);

    expect(find(balanced, 9, 22, 10)!.edgeCoarser).toEqual([1, 0, 0, 0]);
    expect(find(balanced, 9, 22, 11)!.edgeCoarser).toEqual([1, 0, 0, 0]);
    // The east pair touches only its own level; the coarse leaf itself carries
    // no bit — the FINE side is the one that has to collapse an edge.
    expect(find(balanced, 9, 23, 10)!.edgeCoarser).toEqual([0, 0, 0, 0]);
    expect(find(balanced, 8, 10, 5)!.edgeCoarser).toEqual([0, 0, 0, 0]);
  });

  it('leaves a deep band island alone: a band ceiling is a step, not an offender', () => {
    // Søndermarken's shape: a z13 block filling one z7 tile, ringed by z7
    // leaves the bake caps at z7. Coarsening the island against them would
    // walk the whole 6-level step back up and throw the deep band away —
    // the ring cannot meet it halfway, so there is nothing to balance.
    const islandZ7X = 10;
    const islandZ7Y = 5;
    const deepCols = surfaceTileColumns(7, EARTH_TILE_PX);
    const deepRows = deepCols / 2;
    const bands: readonly SurfaceTileBand[] = [
      { uBounds: [0, 1], vBounds: [0, 1], min: 0, max: 7 },
      {
        uBounds: [islandZ7X / deepCols, (islandZ7X + 1) / deepCols],
        vBounds: [1 - (islandZ7Y + 1) / deepRows, 1 - islandZ7Y / deepRows],
        min: 8,
        max: 13,
      },
    ];

    const span = 1 << 6;
    const cut: SurfaceCutTile[] = [];
    for (let dy = 0; dy < span; dy++)
      for (let dx = 0; dx < span; dx++)
        cut.push(leafAt(13, islandZ7X * span + dx, islandZ7Y * span + dy));
    const ring: ReadonlyArray<readonly [number, number]> = [
      [islandZ7X - 1, islandZ7Y],
      [islandZ7X + 1, islandZ7Y],
      [islandZ7X, islandZ7Y - 1],
      [islandZ7X, islandZ7Y + 1],
    ];
    for (const [x, y] of ring) cut.push(leafAt(7, x, y));
    expect(worstStep(cut), 'the fixture really is a six-level step').toBe(6);

    const balanced = balance(cut, bands);

    expect(balanced).toHaveLength(cut.length);
    expect(balanced.filter((t) => t.id.z === 13)).toHaveLength(span * span);
    for (const [x, y] of ring) {
      expect(find(balanced, 7, x, y)!.edgeCoarser, `ring tile ${x},${y}`).toEqual([0, 0, 0, 0]);
    }
    // And the fine side carries no bit either: one bit can only collapse a
    // one-level step, and this one is six.
    expect(find(balanced, 13, islandZ7X * span, islandZ7Y * span)!.edgeCoarser).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('leaves the bits clear when the collapse is refused for want of a parent', () => {
    const cut = [
      leafAt(8, 10, 5),
      leafAt(10, 44, 20),
      leafAt(10, 45, 20),
      leafAt(10, 44, 21),
      leafAt(10, 45, 21),
    ];

    const balanced = balance(cut, UNCAPPED, () => null);

    expect(worstStep(balanced), 'the step survives rather than punching a hole').toBe(2);
    expect(find(balanced, 10, 44, 20)!.edgeCoarser).toEqual([0, 0, 0, 0]);
    expect(find(balanced, 10, 44, 21)!.edgeCoarser).toEqual([0, 0, 0, 0]);
  });

  it('treats the antimeridian columns as neighbours', () => {
    // x = 0 and x = cols - 1 share an edge. Without the wrap, the z9 leaves at
    // the last column see no western neighbour and the seam goes unstitched.
    const lastZ9 = surfaceTileColumns(9, EARTH_TILE_PX) - 1;
    const cut = [
      leafAt(8, 0, 5),
      leafAt(9, lastZ9, 10),
      leafAt(9, lastZ9 - 1, 10),
      leafAt(9, lastZ9, 11),
      leafAt(9, lastZ9 - 1, 11),
    ];

    const balanced = balance(cut);

    expect(find(balanced, 9, lastZ9, 10)!.edgeCoarser).toEqual([0, 1, 0, 0]);
    expect(find(balanced, 9, lastZ9 - 1, 10)!.edgeCoarser).toEqual([0, 0, 0, 0]);
  });
});
