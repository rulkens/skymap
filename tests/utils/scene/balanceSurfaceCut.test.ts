/**
 * The level balance is what bounds `edgeCoarser` to one bit per edge, and one
 * bit is the whole stitching budget F2's vertex stage gets (spec §6.2). Since
 * R14 it works on the HEIGHT level a leaf inherited, not the leaf's own level:
 * a two-level step, or a bit on the wrong edge, is invisible in F1 — nothing
 * reads either — and shows up later as a crack nobody can tie back to the walk.
 * Hand-built cuts, because the interesting shapes (a deep island beside a
 * coarse neighbour, the antimeridian seam) are ones a camera fixture reaches
 * only by accident.
 */

import { describe, it, expect } from 'vitest';

import { balanceSurfaceCut } from '../../../src/utils/scene/balanceSurfaceCut';
import { surfaceTileColumns } from '../../../src/utils/scene/surfaceTileColumns';
import { EARTH_TILE_PX } from '../../../src/data/bodies/earthTileParams';
import type { SurfaceCutTile } from '../../../src/@types/scene/SurfaceCutTile';
import type { SurfaceTileBand } from '../../../src/@types/scene/SurfaceTileBand';

/** `heightLevel` defaults to the leaf's own level (`levelDelta` 0). */
function leafAt(z: number, x: number, y: number, heightLevel = z): SurfaceCutTile {
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
    height: { slot: heightLevel, levelDelta: z - heightLevel, originPosts: [0, 0] },
    edgeCoarser: [0, 0, 0, 0],
  };
}

/** A resolver whose height tiles are resident at exactly `levels` — the
 *  streaming state the balance has to climb through. */
function heightsAt(levels: readonly number[]) {
  return (z: number, _x: number, _y: number, minLevelDelta: number) => {
    for (let levelDelta = Math.max(0, minLevelDelta); z - levelDelta > 0; levelDelta++) {
      if (levels.includes(z - levelDelta))
        return { slot: z - levelDelta, levelDelta, originPosts: [0, 0] as const };
    }
    return null;
  };
}

const ALL_LEVELS = heightsAt(Array.from({ length: 32 }, (_, z) => z));

/** One whole-globe band deep enough that nothing below is band-capped — the
 *  case every pre-R12 test was written against. */
const UNCAPPED: readonly SurfaceTileBand[] = [
  { uBounds: [0, 1], vBounds: [0, 1], min: 0, max: 30 },
];

function balance(
  cut: readonly SurfaceCutTile[],
  bands: readonly SurfaceTileBand[] = UNCAPPED,
  resolveHeight = ALL_LEVELS,
) {
  return balanceSurfaceCut(cut, EARTH_TILE_PX, bands, resolveHeight);
}

function find(cut: readonly SurfaceCutTile[], z: number, x: number, y: number) {
  return cut.find((t) => t.id.z === z && t.id.x === x && t.id.y === y)!;
}

function heightLevel(tile: SurfaceCutTile): number {
  return tile.id.z - tile.height.levelDelta;
}

/** The finest leaf covering cell `(z, x, y)` from a neighbour's point of view,
 *  resolved here rather than by calling into the code under test. */
function coveringHeightLevel(cut: readonly SurfaceCutTile[], z: number, x: number, y: number) {
  for (const tile of cut) {
    const delta = z - tile.id.z;
    if (delta < 0) continue;
    if (x >> delta === tile.id.x && y >> delta === tile.id.y) return heightLevel(tile);
  }
  return null;
}

/** Largest height-level step across any edge-neighbouring pair of leaves. */
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
      const other = coveringHeightLevel(cut, z, cell[0], cell[1]);
      if (other !== null && heightLevel(tile) - other > worst) worst = heightLevel(tile) - other;
    }
  }
  return worst;
}

describe('balanceSurfaceCut', () => {
  it('coarsens the lattice of a leaf two height levels finer than its neighbour', () => {
    // Three leaves in a row at z13; the middle one is still drawing its z11
    // ancestor's posts, a two-level step its neighbours must meet at z12.
    const cut = [leafAt(13, 40, 20), leafAt(13, 41, 20, 11), leafAt(13, 42, 20)];
    expect(worstStep(cut), 'the fixture really is out of balance').toBe(2);

    const balanced = balance(cut);

    expect(worstStep(balanced)).toBeLessThanOrEqual(1);
    expect(balanced.map((t) => t.id)).toEqual(cut.map((t) => t.id));
    expect(find(balanced, 13, 40, 20).height.levelDelta).toBe(1);
    expect(find(balanced, 13, 42, 20).height.levelDelta).toBe(1);
    // The coarse side is never refined to meet them.
    expect(find(balanced, 13, 41, 20).height.levelDelta).toBe(2);
    // Each fine leaf collapses the one edge facing the coarse lattice.
    expect(find(balanced, 13, 40, 20).edgeCoarser).toEqual([0, 1, 0, 0]);
    expect(find(balanced, 13, 42, 20).edgeCoarser).toEqual([1, 0, 0, 0]);
    expect(find(balanced, 13, 41, 20).edgeCoarser).toEqual([0, 0, 0, 0]);
  });

  it('re-scans after a climb, and takes the next resident level when the target is missing', () => {
    // Levels 11 and 9 are resident, 12 and 10 are not. The middle leaf sits at
    // 9, so its neighbour asking for 10 lands on 9 as well — which is only a
    // one-level step for ITS far neighbour once the second pass sees it.
    const cut = [leafAt(13, 40, 20), leafAt(13, 41, 20), leafAt(13, 42, 20, 9)];

    const balanced = balance(cut, UNCAPPED, heightsAt([13, 11, 9]));

    expect(worstStep(balanced)).toBeLessThanOrEqual(1);
    expect(heightLevel(find(balanced, 13, 41, 20))).toBe(9);
    expect(heightLevel(find(balanced, 13, 40, 20))).toBe(9);
  });

  it('leaves a deep band island alone: a band ceiling is a step, not an offender', () => {
    // Søndermarken's shape: a z13 block filling one z7 tile, ringed by z7
    // leaves the bake caps at z7. Coarsening the island against them would
    // throw the deep band's heights away — the ring cannot meet it halfway.
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
    expect(balanced.every((t) => t.height.levelDelta === 0)).toBe(true);
    for (const [x, y] of ring) {
      expect(find(balanced, 7, x, y).edgeCoarser, `ring tile ${x},${y}`).toEqual([0, 0, 0, 0]);
    }
    // And the fine side carries no bit either: one bit can only collapse a
    // one-level step, and this one is six.
    expect(find(balanced, 13, islandZ7X * span, islandZ7Y * span).edgeCoarser).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('leaves the bits clear when nothing coarser is resident to climb to', () => {
    const cut = [leafAt(13, 40, 20), leafAt(13, 41, 20, 11)];

    const balanced = balance(cut, UNCAPPED, heightsAt([13]));

    // Nothing above 13 is resident for the fine leaf, so it cannot meet the
    // coarse one — the seam survives rather than the leaf.
    expect(worstStep(balanced), 'the step survives, the leaf is not dropped').toBe(2);
    expect(balanced).toHaveLength(2);
    expect(find(balanced, 13, 40, 20).edgeCoarser).toEqual([0, 0, 0, 0]);
  });

  it('sets the edge bit toward a band-ceiling neighbour without coarsening either side', () => {
    // A one-level step, not the six-level island case above: too small to
    // coarsen regardless, so this isolates R14(b) — the old code keyed the
    // ceiling check on the neighbour's LEAF level and skipped the pair from
    // BOTH passes, so the bit never got set even though nothing needed climbing.
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
        max: 8,
      },
    ];
    const cut = [leafAt(8, islandZ7X * 2, islandZ7Y * 2), leafAt(7, islandZ7X - 1, islandZ7Y)];

    const balanced = balance(cut, bands);

    expect(find(balanced, 8, islandZ7X * 2, islandZ7Y * 2).height.levelDelta).toBe(0);
    expect(find(balanced, 8, islandZ7X * 2, islandZ7Y * 2).edgeCoarser).toEqual([1, 0, 0, 0]);
  });

  it("climbs the fine side past a neighbour's stale height when tiles exist below it", () => {
    // The neighbour's LEAF sits at z12 (a real ceiling if key'd on leaf level
    // — the band caps at 12) but its resolved HEIGHT is still z10 —
    // streaming lag, not a ceiling: z11 is inside the band, one level under
    // its current height. The old leaf-keyed check saw "nothing at z13" and
    // wrongly exempted the whole pair; the fine z13 siblings either side must
    // still climb to meet it.
    const cappedAt12: readonly SurfaceTileBand[] = [
      { uBounds: [0, 1], vBounds: [0, 1], min: 0, max: 12 },
    ];
    const cut = [leafAt(13, 39, 20), leafAt(12, 20, 10, 10), leafAt(13, 42, 20)];

    const balanced = balance(cut, cappedAt12, heightsAt([13, 12, 11, 10]));

    expect(worstStep(balanced)).toBeLessThanOrEqual(1);
    expect(find(balanced, 13, 39, 20).height.levelDelta).toBe(2);
    expect(find(balanced, 13, 42, 20).height.levelDelta).toBe(2);
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

    expect(find(balanced, 9, lastZ9, 10).edgeCoarser).toEqual([0, 1, 0, 0]);
    expect(find(balanced, 9, lastZ9 - 1, 10).edgeCoarser).toEqual([0, 0, 0, 0]);
  });
});
