/**
 * resolveStandaloneRect — a standalone product's per-leaf lookup: the climb
 * starts at the product's own deepest band, and a stored-empty tile is an
 * answer that ends it (the bake said "nothing here"; a coarser ancestor's
 * texels would contradict that).
 */

import { describe, expect, it } from 'vitest';

import type { SurfaceTileId } from '../../../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileId';
import { resolveStandaloneRect } from '../../../../../../src/layers/body/surfaceTiles/plan/subsystems/resolveStandaloneRect';

const BASE_LEVEL = 4;
const MAX_LEVEL = 7;
const key = (t: SurfaceTileId) => `${t.z}/${t.x}/${t.y}`;
const rectOf = (origin: [number, number], scale: [number, number]) => ({
  slot: 3,
  atlasUvOrigin: origin,
  atlasUvScale: scale,
  readyAtMs: 0,
  subtreeRangeM: null,
});

function resolve(
  at: { z: number; x: number; y: number },
  over: {
    resident?: Record<string, ReturnType<typeof rectOf>>;
    empty?: string[];
    maxLevel?: number;
  } = {},
) {
  const resident = over.resident ?? {};
  const empty = new Set(over.empty ?? []);
  return resolveStandaloneRect({
    product: 'night',
    ...at,
    maxLevel: over.maxLevel ?? MAX_LEVEL,
    baseLevel: BASE_LEVEL,
    residentSlot: (tile) => resident[key(tile)] ?? null,
    isEmpty: (tile) => empty.has(key(tile)),
  });
}

describe('resolveStandaloneRect', () => {
  it('an own empty tile stops at empty even with a resident ancestor', () => {
    // Bug caught: the climb skipping an empty tile and painting its ancestor over a
    // deliberately blank tile.
    const result = resolve(
      { z: 7, x: 40, y: 20 },
      { empty: ['7/40/20'], resident: { '6/20/10': rectOf([0, 0], [0.5, 0.5]) } },
    );
    expect(result).toBe('empty');
  });

  it('an empty ancestor stops the walk at empty', () => {
    const result = resolve(
      { z: 7, x: 40, y: 20 },
      { empty: ['6/20/10'], resident: { '5/10/5': rectOf([0, 0], [0.5, 0.5]) } },
    );
    expect(result).toBe('empty');
  });

  it('a resident ancestor gives the flattened sub-rect', () => {
    // The leaf at z7 sits two levels below its z5 ancestor 10/5: x 42 is the
    // third column (offset 2) of the 4-wide block, y 22 the third row.
    const result = resolve(
      { z: 7, x: 42, y: 22 },
      { resident: { '5/10/5': rectOf([0.25, 0.5], [0.25, 0.25]) } },
    );
    expect(result).toEqual({
      atlasUvOrigin: [0.25 + 0.5 * 0.25, 0.5 + 0.5 * 0.25],
      atlasUvScale: [0.0625, 0.0625],
    });
  });

  it('the walk starts at maxLevel', () => {
    // A z10 leaf under a z7 bake: its own z10 key is never asked for, and the z7
    // ancestor's rect is narrowed by all three levels.
    const asked: string[] = [];
    const result = resolveStandaloneRect({
      product: 'night',
      z: 10,
      x: 8 * 17 + 3,
      y: 8 * 9 + 5,
      maxLevel: MAX_LEVEL,
      baseLevel: BASE_LEVEL,
      residentSlot: (tile) => {
        asked.push(key(tile));
        return tile.z === 7 ? rectOf([0, 0], [1, 1]) : null;
      },
      isEmpty: () => false,
    });
    expect(asked).toEqual(['7/17/9']);
    expect(result).toEqual({ atlasUvOrigin: [3 / 8, 5 / 8], atlasUvScale: [1 / 8, 1 / 8] });
  });

  it('maxLevel below zero gives null', () => {
    expect(resolve({ z: 7, x: 1, y: 1 }, { maxLevel: -1 })).toBeNull();
  });
});
