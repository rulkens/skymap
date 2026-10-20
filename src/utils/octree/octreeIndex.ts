/**
 * An octree node table's load-time index, built once and memoised per table. A
 * level-`L` row's children (named by `childMask`) sit at level `L-1`, Morton
 * `(M << 3) | k`, and are found by key: within one object every child of a
 * childful row is present, except a chunk root's (its children live in the chunk).
 * Children sort before their parent (lower level), so one ascending pass folds
 * `holdsChunkRoot` up the tree.
 */
import type { OctreeGrid } from '../../@types/octree/OctreeGrid';
import type { OctreeNodeTable } from '../../@types/octree/OctreeNodeTable';
import type { OctreeIndex } from '../../@types/octree/OctreeIndex';
import { LEVEL_KEY_STRIDE, NO_CHUNK_REF, OCTANTS } from '../../data/octree/octreeFormat';
import { mortonDecode3 } from '../math/mortonDecode3';

const cache = new WeakMap<OctreeNodeTable, OctreeIndex>();

export function octreeIndex(nodes: OctreeNodeTable, grid: OctreeGrid): OctreeIndex {
  const cached = cache.get(nodes);
  if (cached) return cached;

  const n = nodes.count;
  const childIndex = new Int32Array(n * OCTANTS).fill(-1);
  const boxOrigin = new Float64Array(n * 3);
  const boxEdge = new Float64Array(n);
  const holdsChunkRoot = new Uint8Array(n);

  const rowByKey = new Map<number, number>();
  for (let i = 0; i < n; i++)
    rowByKey.set(nodes.level[i]! * LEVEL_KEY_STRIDE + nodes.morton[i]!, i);

  const [gx, gy, gz] = grid.origin;
  for (let i = 0; i < n; i++) {
    const level = nodes.level[i]!;
    const morton = nodes.morton[i]!;
    const edge = grid.cellEdge * 2 ** level;
    boxEdge[i] = edge;
    const [cx, cy, cz] = mortonDecode3(morton);
    boxOrigin[i * 3] = gx + cx * edge;
    boxOrigin[i * 3 + 1] = gy + cy * edge;
    boxOrigin[i * 3 + 2] = gz + cz * edge;

    if (nodes.chunkRef[i] !== NO_CHUNK_REF) holdsChunkRoot[i] = 1;
    const mask = nodes.childMask[i]!;
    if (mask === 0) continue;
    const childKeyBase = (level - 1) * LEVEL_KEY_STRIDE + morton * OCTANTS;
    for (let k = 0; k < OCTANTS; k++) {
      if ((mask & (1 << k)) === 0) continue;
      const child = rowByKey.get(childKeyBase + k);
      if (child === undefined) continue;
      childIndex[i * OCTANTS + k] = child;
      if (holdsChunkRoot[child] === 1) holdsChunkRoot[i] = 1;
    }
  }

  const index: OctreeIndex = {
    childIndex,
    boxOrigin,
    boxEdge,
    holdsChunkRoot,
  };
  cache.set(nodes, index);
  return index;
}
