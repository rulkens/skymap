/**
 * A star node table's load-time index, built once and memoised per table. A
 * level-`L` row's children (named by `childMask`) sit at level `L-1`, Morton
 * `(M << 3) | k`, and are found by key: within one object every child of a
 * childful row is present, except a chunk root's (its children live in the chunk).
 */
import type { OctreeGrid } from '../../@types/octree/OctreeGrid';
import type { OctreeNodeTable } from '../../@types/octree/OctreeNodeTable';
import type { StarOctreeIndex } from '../../layers/starCatalog/@types/StarOctreeIndex';
import { LEVEL_KEY_STRIDE, NO_CHUNK_REF, OCTANTS } from '../../data/octree/octreeFormat';
import { mortonDecode3 } from '../math/mortonDecode3';

const cache = new WeakMap<OctreeNodeTable, StarOctreeIndex>();

export function starOctreeIndex(nodes: OctreeNodeTable, grid: OctreeGrid): StarOctreeIndex {
  const cached = cache.get(nodes);
  if (cached) return cached;

  const n = nodes.count;
  const childIndex = new Int32Array(n * OCTANTS).fill(-1);
  const boxOriginPc = new Float64Array(n * 3);
  const boxEdgePc = new Float64Array(n);

  const chunkRoots: number[] = [];
  const rowByKey = new Map<number, number>();
  for (let i = 0; i < n; i++)
    rowByKey.set(nodes.level[i]! * LEVEL_KEY_STRIDE + nodes.morton[i]!, i);

  const [gx, gy, gz] = grid.origin;
  for (let i = 0; i < n; i++) {
    const level = nodes.level[i]!;
    const morton = nodes.morton[i]!;
    const edgePc = grid.cellEdge * 2 ** level;
    boxEdgePc[i] = edgePc;
    const [cx, cy, cz] = mortonDecode3(morton);
    boxOriginPc[i * 3] = gx + cx * edgePc;
    boxOriginPc[i * 3 + 1] = gy + cy * edgePc;
    boxOriginPc[i * 3 + 2] = gz + cz * edgePc;

    const mask = nodes.childMask[i]!;
    if (mask === 0) continue;
    if (nodes.chunkRef[i] !== NO_CHUNK_REF) chunkRoots.push(i);
    const childKeyBase = (level - 1) * LEVEL_KEY_STRIDE + morton * OCTANTS;
    for (let k = 0; k < OCTANTS; k++) {
      if ((mask & (1 << k)) === 0) continue;
      const child = rowByKey.get(childKeyBase + k);
      if (child !== undefined) childIndex[i * OCTANTS + k] = child;
    }
  }

  const index: StarOctreeIndex = {
    childIndex,
    boxOriginPc,
    boxEdgePc,
    chunkRoots: Int32Array.from(chunkRoots),
  };
  cache.set(nodes, index);
  return index;
}
