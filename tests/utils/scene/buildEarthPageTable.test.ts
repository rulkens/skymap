/**
 * buildEarthPageTable — spec tests 6 and 7, plus the identity case.
 *
 * Three properties, and nothing else. The byte map itself is a table and a test
 * over it would restate it; the array length is a compiler-adjacent fact. What
 * earns assertions here is the finest-ancestor fill order (design 5's whole
 * graceful-degradation mechanism), the never-names-an-evicted-slot guarantee
 * (a regression test by construction against the recorded "eviction granularity
 * must match slot granularity" landmine), and the empty-atlas identity case that
 * every degradation path collapses to.
 */

import { describe, it, expect } from 'vitest';

import type { EarthResidentTile } from '../../../src/@types/scene/EarthResidentTile';
import type { EarthTileId } from '../../../src/@types/data/EarthTileId';
import type { EarthTilePlan } from '../../../src/@types/scene/EarthTilePlan';
import { buildEarthPageTable } from '../../../src/utils/scene/buildEarthPageTable';
import { earthTilePath } from '../../../src/utils/scene/earthTilePath';
import { EARTH_TILE_PX } from '../../../src/data/bodies/earthTileParams';
import { TextureAtlas } from '../../../src/services/gpu/resources/textureAtlas';

const WINDOW_SIDE = 16;
const SLOTS_PER_ROW = 8;

const tile = (z: number, x: number, y: number): EarthTileId => ({
  kind: 'surface',
  z,
  x,
  y,
});

/** The four bytes of one window cell, as [R, G, B, A]. */
const cellAt = (table: Uint8Array, dx: number, dy: number): readonly number[] => {
  const at = (dy * WINDOW_SIDE + dx) * 4;
  return [table[at]!, table[at + 1]!, table[at + 2]!, table[at + 3]!];
};

describe('buildEarthPageTable', () => {
  it('names the finest resident ancestor in every cell', () => {
    // The window sits at z7, where the grid is 128 columns wide, with its origin
    // three columns west of the antimeridian so the wrapping subtraction is
    // exercised too: dx = ((X - 126) + 128) % 128 = X + 2 for the columns below,
    // and dy = Y - 2.
    const plan: EarthTilePlan = { zWin: 7, winX0: 126, winY0: 2, requests: [] };

    // Coarse: z5 tile (1, 1) spans 4 cells each way at z7 — X 4..7, Y 4..7.
    // Fine:   z6 tile (2, 2) spans 2 — X 4..5, Y 4..5, i.e. the north-west
    //         quarter of the coarse tile. Its three siblings are absent.
    // Slot 5 is column 5 / row 0; slot 12 is column 4 / row 1 — chosen so the
    // two are distinguishable in BOTH channels.
    //
    // The fine tile is inserted FIRST, so an implementation that wrote in list
    // order rather than in increasing z would let the coarse tile bury it.
    const resident: readonly EarthResidentTile[] = [
      { tile: tile(6, 2, 2), slot: 12, weight: 1 },
      { tile: tile(5, 1, 1), slot: 5, weight: 1 },
    ];

    const table = buildEarthPageTable({
      resident,
      plan,
      slotsPerRow: SLOTS_PER_ROW,
      windowSide: WINDOW_SIDE,
      tilePx: EARTH_TILE_PX,
    });

    // Under the fine tile (X 4..5 → dx 6..7, Y 4..5 → dy 2..3): the FINE slot,
    // carrying its own level in B.
    expect(cellAt(table, 6, 2)).toEqual([4, 1, 6, 255]);
    expect(cellAt(table, 7, 3)).toEqual([4, 1, 6, 255]);

    // The coarse tile's other three quadrants still name the COARSE slot at z5 —
    // this is the ground that keeps its resolution while a finer tile is in
    // flight. X = 6 (dx 8) is the north-east quadrant; Y = 6 (dy 4) is the
    // south-west one.
    expect(cellAt(table, 8, 2)).toEqual([5, 0, 5, 255]);
    expect(cellAt(table, 6, 4)).toEqual([5, 0, 5, 255]);

    // X = 3 (dx 5) is outside the coarse tile entirely: base only.
    expect(cellAt(table, 5, 2)).toEqual([0, 0, 0, 0]);
  });

  it('never names an evicted slot after a rebuild', () => {
    // A real atlas with the Earth geometry — 4096 / 512 = 8 slots per row, 64
    // slots. No initTexture(), so no GPU device is needed.
    const atlas = new TextureAtlas(null as unknown as GPUDevice, {
      atlasSide: 4096,
      slotSide: 512,
      format: 'rgba8unorm-srgb',
      label: 'test',
    });

    // The atlas is keyed by the formatted path — that's its own contract, shared
    // with the runtime fetch — so the test tracks a slot map and a tile lookup
    // alongside it exactly the way the tile subsystem will: allocations write
    // both, the evict handler clears the slot map. That is what makes the page
    // table a projection of the atlas rather than a parallel record of it; only
    // the test needs the key, because only the atlas is keyed by one.
    const slotByKey = new Map<string, number>();
    const tileByKey = new Map<string, EarthTileId>();
    atlas.setEvictHandler((evicted) => {
      slotByKey.delete(evicted);
    });

    // 65 distinct tiles at the window's own level, allocated with ascending
    // frame numbers, so the 65th forces the LRU (the first) out of slot 0. One
    // tile per frame also means no allocation is ever refused — `allocate`
    // only returns null when the atlas is full of slots claimed on the frame
    // doing the asking — hence the non-null assertions.
    const keys: string[] = [];
    for (let i = 0; i <= 64; i++) {
      const t = tile(7, i % 16, Math.floor(i / 16));
      const tileKey = earthTilePath(t, 'earth-tiles/v1');
      keys.push(tileKey);
      tileByKey.set(tileKey, t);
      slotByKey.set(tileKey, atlas.allocate(tileKey, i)!);
    }
    expect(slotByKey.has(keys[0]!)).toBe(false);
    expect(slotByKey.get(keys[64]!)).toBe(0);

    const resident: readonly EarthResidentTile[] = Array.from(slotByKey, ([tileKey, slot]) => ({
      tile: tileByKey.get(tileKey)!,
      slot,
      weight: 1,
    }));

    const table = buildEarthPageTable({
      resident,
      plan: { zWin: 7, winX0: 0, winY0: 0, requests: [] },
      slotsPerRow: SLOTS_PER_ROW,
      windowSide: WINDOW_SIDE,
      tilePx: EARTH_TILE_PX,
    });

    // The evicted tile was (0, 0), so its cell must have fallen back to the base
    // rather than kept pointing at the slot somebody else now owns.
    expect(cellAt(table, 0, 0)).toEqual([0, 0, 0, 0]);

    // And slot 0 is named by exactly one cell: the 65th tile, (0, 4), which is
    // what actually occupies it now.
    const namingSlotZero: Array<readonly [number, number]> = [];
    for (let dy = 0; dy < WINDOW_SIDE; dy++) {
      for (let dx = 0; dx < WINDOW_SIDE; dx++) {
        const c = cellAt(table, dx, dy);
        if (c[3]! > 0 && c[0] === 0 && c[1] === 0) namingSlotZero.push([dx, dy]);
      }
    }
    expect(namingSlotZero).toEqual([[0, 4]]);
  });

  it('leaves every cell at A = 0 when nothing is resident', () => {
    // The identity case: the fragment's blend weight is 0 everywhere, so it
    // renders bit-identically to the whole-globe base. Frame one of a descent, a
    // failed manifest fetch and a device where the atlas allocation failed all
    // collapse to exactly this.
    const table = buildEarthPageTable({
      resident: [],
      plan: { zWin: 7, winX0: 0, winY0: 0, requests: [] },
      slotsPerRow: SLOTS_PER_ROW,
      windowSide: WINDOW_SIDE,
      tilePx: EARTH_TILE_PX,
    });

    for (let i = 3; i < table.length; i += 4) expect(table[i]).toBe(0);
  });
});
