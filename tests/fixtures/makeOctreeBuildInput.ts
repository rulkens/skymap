/**
 * makeOctreeBuildInput — a star-schema `OctreeBuildInput` from plain records, shared by the
 * stratify, chunk and catalog-writer tests. `randomOctreeRecords` scatters seeded records
 * through a box so a fixture has real depth without hand-placing every star.
 */
import type { Vec3 } from '../../src/@types/math/Vec3';
import type { OctreeGrid } from '../../src/@types/octree/OctreeGrid';
import type { OctreeBuildInput } from '../../tools/@types/octree/OctreeBuildInput';
import { STAR_COLUMN_SCHEMA } from '../../src/data/octree/starOctreeFamily';
import { mulberry32 } from '../../src/utils/random/mulberry32';

export const TEST_STRATIFY = { thr: 0.16, mLim: 10, refUnit: 10 } as const;

export function makeOctreeBuildInput(
  records: readonly { readonly pos: Vec3; readonly absMag: number; readonly colourIndex?: number }[],
  grid: OctreeGrid,
): OctreeBuildInput {
  return {
    grid,
    stratify: TEST_STRATIFY,
    positions: Float64Array.from(records.flatMap((r) => r.pos)),
    magnitudeColumn: 'absMag',
    columns: new Map([
      ['absMag', Float32Array.from(records, (r) => r.absMag)],
      ['colourIndex', Float32Array.from(records, (r) => r.colourIndex ?? 1)],
    ]),
    schema: STAR_COLUMN_SCHEMA,
  };
}

export function randomOctreeRecords(
  n: number,
  seed: number,
  extent: number,
  absMagRange: readonly [number, number],
): { pos: Vec3; absMag: number; colourIndex: number }[] {
  const rand = mulberry32(seed);
  const [lo, hi] = absMagRange;
  return Array.from({ length: n }, () => ({
    pos: [rand() * extent, rand() * extent, rand() * extent],
    absMag: lo + rand() * (hi - lo),
    colourIndex: -0.5 + rand() * 4,
  }));
}
