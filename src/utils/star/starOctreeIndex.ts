/**
 * A star catalog's load-time index: flat typed arrays parallel to
 * `catalog.nodes`, built once and memoised per catalog. Read by the GPU cut's
 * node-table packer and by `nearestResolvableStar`. Resolving
 * `(level, morton) → node index` needs a scan; the same forward scan folds in
 * `subtreeCounts` (a leaf's own `recordCount`; an aggregate's sum over children).
 *
 * Relies on `buildStarOctree`'s layout: `catalog.nodes` holds every node in
 * ascending `(level, mortonIndex)` order, so a forward scan visits children
 * before parents and the final node is the root. A level-`L` aggregate's
 * children (named by `childMask`) sit at level `L-1`, Morton `(M << 3) | k` for
 * each set bit `k`; a childless node is a leaf. Box origin is `gridOrigin +
 * mortonDecode3(M) · (cellEdgePc · 2^L)`.
 */
import type { StarCatalog } from '../../@types/data/starCatalog/StarCatalog';
import type { StarOctreeIndex } from '../../layers/starCatalog/@types/StarOctreeIndex';
import { mortonDecode3 } from '../math/mortonDecode3';

const cache = new WeakMap<StarCatalog, StarOctreeIndex>();

/** Pack (level, morton) into one integer key for the build-time child lookup. */
function nodeKey(level: number, morton: number): number {
  // level is a single on-disk byte (0..255); shift morton clear of it.
  return level * 0x100000000 + morton;
}

export function starOctreeIndex(catalog: StarCatalog): StarOctreeIndex {
  const cached = cache.get(catalog);
  if (cached) return cached;

  const { nodes, cellEdgePc, gridOrigin } = catalog;
  const n = nodes.length;

  const childIndex = new Int32Array(n * 8).fill(-1);
  const childMask = new Uint8Array(n);
  const firstRecord = new Uint32Array(n);
  const recordCount = new Uint32Array(n);
  const boxOriginPc = new Float64Array(n * 3);
  const boxEdgePc = new Float64Array(n);
  const subtreeCounts = new Uint32Array(n);

  // (level, morton) → node index, so a parent can resolve its present children.
  const nodeByKey = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    nodeByKey.set(nodeKey(nodes[i]!.level, nodes[i]!.mortonIndex), i);
  }

  const [gx, gy, gz] = gridOrigin;

  // Forward scan = children before parents, so `subtreeCounts` of every child
  // is already summed when its parent is read.
  for (let i = 0; i < n; i++) {
    const node = nodes[i]!;
    const lvl = node.level;
    childMask[i] = node.childMask;
    firstRecord[i] = node.firstRecord;
    recordCount[i] = node.recordCount;

    const edgePc = cellEdgePc * 2 ** lvl;
    boxEdgePc[i] = edgePc;
    const [cx, cy, cz] = mortonDecode3(node.mortonIndex);
    const o3 = i * 3;
    boxOriginPc[o3] = gx + cx * edgePc;
    boxOriginPc[o3 + 1] = gy + cy * edgePc;
    boxOriginPc[o3 + 2] = gz + cz * edgePc;

    if (node.childMask === 0) {
      // Childless = leaf (level-0 cell OR a fat leaf above level 0): its
      // records ARE its real stars, so its subtree count is its recordCount.
      subtreeCounts[i] = node.recordCount;
      continue;
    }

    const childLevel = lvl - 1;
    const baseMorton = node.mortonIndex << 3;
    const cbase = i * 8;
    let sum = 0;
    for (let k = 0; k < 8; k++) {
      if ((node.childMask & (1 << k)) === 0) continue;
      const childIdx = nodeByKey.get(nodeKey(childLevel, baseMorton | k));
      if (childIdx === undefined) continue;
      childIndex[cbase + k] = childIdx;
      sum += subtreeCounts[childIdx]!;
    }
    subtreeCounts[i] = sum;
  }

  const index: StarOctreeIndex = {
    childIndex,
    childMask,
    firstRecord,
    recordCount,
    boxOriginPc,
    boxEdgePc,
    subtreeCounts,
  };
  cache.set(catalog, index);
  return index;
}
