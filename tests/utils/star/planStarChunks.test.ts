/**
 * The CPU chunk planner over a hand-built index: a level-5 root (32 pc) whose
 * five level-4 children are chunk roots, seen from 14 pc below it. Proxies at
 * thr 0.5 (thr² 0.25): A 1.31, B 0.98, C 0.98, E 0.28, D 0.249 (just below).
 */
import { describe, it, expect } from 'vitest';

import { planStarChunks } from '../../../src/utils/star/planStarChunks';
import { starOctreeIndex } from '../../../src/utils/star/starOctreeIndex';
import { NO_CHUNK_REF } from '../../../src/data/octree/octreeFormat';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { StarChunk } from '../../../src/@types/data/starCatalog/StarChunk';
import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';
import type { StarOctree } from '../../../src/@types/data/starCatalog/StarOctree';
import type { StarCutSpec } from '../../../src/layers/starCatalog/@types/StarCutSpec';

// Rows (level, morton) ascending: A, B, C, E, D at level 4, then the root.
const MORTONS = [0, 1, 2, 4, 7];
const A = 0;
const B = 1;
const C = 2;
const E = 3;
const D = 4;

const OCTREE = {
  grid: { bits: 10, origin: [0, 0, 0], cellEdge: 1 },
  nodes: {
    count: 6,
    morton: Uint32Array.from([...MORTONS, 0]),
    level: Uint8Array.from([4, 4, 4, 4, 4, 5]),
    childMask: Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff, 0b1001_0111]),
    firstRecord: new Uint32Array(6),
    ownCount: new Uint32Array(6),
    blobCount: new Uint32Array(6),
    chunkRef: Uint32Array.from([A, B, C, E, D, NO_CHUNK_REF]),
  },
  chunks: MORTONS.map(() => ({})),
  chunkCount: 7,
} as unknown as StarOctree;

/** Rows as [level, morton, childMask, chunkRef], sorted by (level, morton). */
function table(rows: readonly (readonly number[])[]): OctreeNodeTable {
  const col = (k: number) => rows.map((r) => r[k]!);
  return {
    count: rows.length,
    level: Uint8Array.from(col(0)),
    morton: Uint32Array.from(col(1)),
    childMask: Uint8Array.from(col(2)),
    firstRecord: new Uint32Array(rows.length),
    ownCount: new Uint32Array(rows.length),
    blobCount: new Uint32Array(rows.length),
    chunkRef: Uint32Array.from(col(3)),
  };
}

const chunkOf = (nodes: OctreeNodeTable) => ({ nodes }) as unknown as StarChunk;
const EMPTY_CHUNK = chunkOf(table([]));

const pc = (v: number) => v * SCALE_UNITS.PC_TO_MPC;

function cut(planes: Float32Array): StarCutSpec {
  return {
    originMpc: [pc(8), pc(8), pc(-14)],
    planes,
    refineThreshold: 0.5,
    worldSpread: 1,
    leafMarginRad: 0,
    sources: [],
  };
}

// One view: y ≤ 0 about the eye (C, at y 16–32, sits wholly outside), five planes that pass everything.
const ONE_VIEW = Float32Array.from([
  0,
  -1,
  0,
  0,
  ...Array.from({ length: 5 }, () => [0, 0, 1, 1]).flat(),
]);

const plan = (
  planes: Float32Array,
  resident: readonly number[],
  limit = 8,
  failed: readonly number[] = [],
) =>
  planStarChunks(
    OCTREE,
    starOctreeIndex(OCTREE.nodes, OCTREE.grid),
    cut(planes),
    (ref) => (resident.includes(ref) ? EMPTY_CHUNK : null),
    (ref) => failed.includes(ref),
    limit,
  );

describe('planStarChunks', () => {
  it('a failed chunk holds no place among the limited requests', () => {
    const { requests, touched } = plan(ONE_VIEW, [], 2, [B]);
    expect(requests.map((r) => r.chunkRef)).toEqual([A, E]);
    expect(touched).toEqual([]);
  });

  it('planStarChunks: requests are in descending proxy, a culled chunk is not requested, a resident chunk is touched', () => {
    const { requests, touched } = plan(ONE_VIEW, [A]);
    expect(touched).toEqual([A]);
    expect(requests.map((r) => r.chunkRef)).toEqual([B, E]);
    expect(requests[0]!.priority).toBeCloseTo(256 / 260, 6);
  });

  it('planStarChunks: with no planes (more than CUT_MAX_VIEWS) nothing is culled', () => {
    const { requests } = plan(new Float32Array(0), [A]);
    expect(requests.map((r) => r.chunkRef).sort()).toEqual([B, C, E]);
  });

  it('planStarChunks: keeps only the limit best requests, in descending proxy', () => {
    // A 1.31 first; B and C tie at 0.98; E, the weakest, is dropped.
    const refs = plan(new Float32Array(0), [], 3).requests.map((r) => r.chunkRef);
    expect(refs[0]).toBe(A);
    expect(refs.slice(1).sort()).toEqual([B, C]);
  });

  it("planStarChunks: a chunk with several roots is requested once, at its best root's proxy", () => {
    // B and E share chunk B: E's weaker proxy must not repeat it (the stream would fund it twice).
    const shared = {
      ...OCTREE,
      nodes: { ...OCTREE.nodes, chunkRef: Uint32Array.from([A, B, C, B, D, NO_CHUNK_REF]) },
    } as StarOctree;
    const { requests } = planStarChunks(
      shared,
      starOctreeIndex(shared.nodes, shared.grid),
      cut(new Float32Array(0)),
      () => null,
      () => false,
      8,
    );
    expect(requests.map((r) => r.chunkRef).sort()).toEqual([A, B, C]);
    expect(requests.find((r) => r.chunkRef === B)!.priority).toBeCloseTo(256 / 260, 6);
  });
  it('walks into a resident chunk and requests the chunk rooted in its rows, under the same pruning', () => {
    // Chunk A holds A's level-3 children: octant 0 (z 0–8, proxy 64/196 ≥ 0.25) roots chunk 5,
    // octant 4 (z 8–16, proxy 64/484) roots chunk 6 and does not refine.
    const chunkA = chunkOf(
      table([
        [3, 0, 0xff, 5],
        [3, 4, 0xff, 6],
      ]),
    );
    const { requests, touched } = planStarChunks(
      OCTREE,
      starOctreeIndex(OCTREE.nodes, OCTREE.grid),
      cut(ONE_VIEW),
      (ref) => (ref === A ? chunkA : null),
      () => false,
      8,
    );
    expect(touched).toEqual([A]);
    expect(requests.map((r) => r.chunkRef)).toEqual([B, 5, E]);
    expect(requests[1]!.priority).toBeCloseTo(64 / 196, 6);
  });
});
