/**
 * starOctreeIndex — the star octree's *load-time* index: the derived, flat,
 * typed-array view of `catalog.nodes` that the per-frame walk and the flux-glow
 * count derivation both read, built once per loaded catalog and memoised on it.
 *
 * ── Why this exists (the N1 finding) ───────────────────────────────────────
 *
 * The decoded `catalog.nodes` is an array of objects in on-disk order. To
 * descend the tree you must map a parent's `(childLevel, childMorton)` back to
 * the node index that holds it — the Morton layout names *where* a child is, not
 * its array slot. The walk originally rebuilt that `(level, morton) → index`
 * `Map` from scratch on every call: ~300k `Map.set` inserts per frame on the
 * large tier (one per node), plus a per-descent-step `Map.get` hash lookup. That
 * per-call rebuild dominated the walk's cost. It is a pure function of the node
 * table, so it belongs at load time, not in the frame loop.
 *
 * This module resolves every child link *once* into a flat
 * `childIndex[nodeIdx*8 + octant]` (`-1` for an absent octant), so the frame
 * walk does O(1) typed-array reads with no hashing at all. It also lifts the box
 * geometry the walk's distance math needs (origin + edge in parsecs) and the
 * scalar fields it reads per node (level, record slice) into parallel typed
 * arrays, so the hot loop touches only typed arrays and scalar locals — no
 * object property chains, no per-node allocation.
 *
 * ── One pass, shared with the flux-count derivation ────────────────────────
 *
 * `subtreeStarCounts` needs the *same* child resolution over the *same* node
 * table, in the *same* ascending-(level, morton) order — its bottom-up sum
 * visits every child before its parent (children sit one level below). So the
 * subtree star count is folded into this one forward scan rather than
 * duplicating the map build and child walk in a second module: once `childIndex`
 * is resolved, `subtreeCounts[i]` is a childless node's own `recordCount`
 * (leaf) or the sum of its present children's counts (aggregate — all already
 * filled, because children precede parents on disk). `subtreeStarCounts` is now
 * a thin accessor onto `subtreeCounts` here.
 *
 * ── Layout invariants relied on (from `buildStarOctree`) ───────────────────
 *
 * `catalog.nodes` holds every node in ascending `(level, mortonIndex)` order —
 * leaves (level-0 and fat) and aggregates interleaved by level — so the *final*
 * node is the single root and a forward scan visits children before parents. A
 * level-`L` aggregate with Morton `M` has its present children (named by
 * `childMask`) one level below at level `L-1` with Morton `(M << 3) | k` for
 * each set bit `k`; a childless node (`childMask === 0`) is a leaf. The box
 * origin is
 * `gridOrigin + mortonDecode3(M) · (cellEdgePc · 2^L)` — the same reconstruction
 * `walkStarOctreeCut`'s `distanceToBox` and `starNodeOriginRelCamMpc` invert.
 */
import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import { mortonDecode3 } from '../../../../utils/math/mortonDecode3';

/**
 * The load-time index of a star catalog: flat, parallel-to-`catalog.nodes`
 * typed arrays the per-frame walk and the count derivation read. All arrays are
 * indexed by node index `i ∈ [0, nodeCount)`, except `childIndex` (8 octant
 * slots per node) and `boxOriginPc` (3 axes per node).
 */
export type StarOctreeIndex = {
  /**
   * `childIndex[i*8 + k]` is the node index of node `i`'s child in octant `k`,
   * or `-1` when that octant is absent. Resolves the whole descent with no
   * hashing — replaces the per-call `(level, morton) → index` Map.
   */
  readonly childIndex: Int32Array;
  /**
   * Per-node octree level, lifted out of the node objects. Sizes the node's box
   * (`cellEdgePc · 2^level`); it does NOT discriminate leaf from aggregate — a
   * fat leaf lives at `level > 0` yet is a leaf. `childMask === 0` is the
   * leaf-vs-aggregate test (see `buildStarOctree`).
   */
  readonly level: Uint8Array;
  /** Per-node record-slice base (`node.firstRecord`). */
  readonly firstRecord: Uint32Array;
  /** Per-node record-slice length (`node.recordCount`). */
  readonly recordCount: Uint32Array;
  /**
   * Per-node box origin in parsecs, 3 axes each (`boxOriginPc[i*3 + axis]`).
   * Float64 because the box distance is a large-minus-large subtraction against
   * a parsec-scale grid corner that can sit thousands of pc from the Sun — the
   * same precision the walk's `distanceToBox` did in JS numbers.
   */
  readonly boxOriginPc: Float64Array;
  /** Per-node box edge in parsecs (`cellEdgePc · 2^level`). */
  readonly boxEdgePc: Float64Array;
  /**
   * Per-node subtree leaf-star count: a leaf's own `recordCount`, an aggregate's
   * sum over its present children. The multiplier the flux-glow shader uses to
   * rebuild summed light from a record's stored MEAN flux. Exact in `u32` (the
   * largest tier holds ~13.36 M stars < 2³²).
   */
  readonly subtreeCounts: Uint32Array;
};

/** Per-catalog memo: the index is a pure function of the (immutable) node table. */
const cache = new WeakMap<StarCatalog, StarOctreeIndex>();

/** Pack (level, morton) into one integer key for the build-time child lookup. */
function nodeKey(level: number, morton: number): number {
  // level is a single on-disk byte (0..255); shift morton clear of it.
  return level * 0x100000000 + morton;
}

/**
 * Build (or return the memoised) load-time index for a catalog. Runs one O(nodes)
 * forward scan: resolve every child link, lift the box geometry + scalar fields
 * into typed arrays, and sum the subtree counts bottom-up in the same pass.
 */
export function starOctreeIndex(catalog: StarCatalog): StarOctreeIndex {
  const cached = cache.get(catalog);
  if (cached) return cached;

  const { nodes, cellEdgePc, gridOrigin } = catalog;
  const n = nodes.length;

  const childIndex = new Int32Array(n * 8).fill(-1);
  const level = new Uint8Array(n);
  const firstRecord = new Uint32Array(n);
  const recordCount = new Uint32Array(n);
  const boxOriginPc = new Float64Array(n * 3);
  const boxEdgePc = new Float64Array(n);
  const subtreeCounts = new Uint32Array(n);

  // (level, morton) → node index, so a parent can resolve its present children.
  // This is the map the frame walk used to rebuild every call; it lives and dies
  // inside this one load-time build now.
  const nodeByKey = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    nodeByKey.set(nodeKey(nodes[i]!.level, nodes[i]!.mortonIndex), i);
  }

  const [gx, gy, gz] = gridOrigin;

  // Forward scan = children before parents (leaves first, then ascending level),
  // so `subtreeCounts` of every child is already summed when its parent is read.
  for (let i = 0; i < n; i++) {
    const node = nodes[i]!;
    const lvl = node.level;
    level[i] = lvl;
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
      // A childless node is a leaf (level-0 cell OR a fat leaf at level > 0):
      // its records ARE its real stars, so its subtree count is its recordCount.
      // Level does NOT discriminate — a fat leaf lives above level 0.
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
    level,
    firstRecord,
    recordCount,
    boxOriginPc,
    boxEdgePc,
    subtreeCounts,
  };
  cache.set(catalog, index);
  return index;
}
