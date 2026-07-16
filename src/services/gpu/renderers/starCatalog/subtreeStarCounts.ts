/**
 * subtreeStarCounts — derive, per octree node, how many real leaf stars live
 * beneath it, so the flux-glow shader can rebuild an aggregate's summed light.
 *
 * ── Why the runtime derives this (and why it is not on disk) ───────────────
 *
 * An aggregate record stores the magnitude of its subtree's *mean* star flux,
 * never the summed flux — because the record's 7-bit magnitude LUT is sized for
 * a single star and a summed magnitude of thousands of stars would clamp to the
 * bright floor (see `mergeFluxAggregate` / `buildStarOctree` for the full
 * argument). The physically-correct summed flux is recovered on the GPU by
 * multiplying the record's per-star flux back up by the subtree star count
 * `N` — so the shader needs `N` per drawn aggregate.
 *
 * `N` is *derivable* from the node table already on disk, so the `.bin` format
 * is unchanged (no version bump): a leaf's count is its `recordCount` (leaf
 * records are real stars), and an aggregate's is the sum over its present
 * children. Storing it would be storing a redundant, derived quantity — this
 * module computes it once instead.
 *
 * ── One bottom-up pass over the on-disk node order ─────────────────────────
 *
 * `buildStarOctree`'s layout invariant puts leaves first, then the aggregate
 * pyramid in ascending `level`. So a single forward scan of `catalog.nodes`
 * visits every child before its parent: a leaf sets `count = recordCount`, and
 * an aggregate sums `count` over the children the `childMask` + Morton layout
 * names (a level-`L` node with Morton `M` has present children at level `L-1`
 * with Morton `(M << 3) | k` for each set bit `k`). This mirrors the descent
 * `walkStarOctreeCut` runs per frame, but here it is one O(nodes) pass, and the
 * result is memoised per catalog identity so repeated frames pay nothing.
 *
 * The largest tier holds ~13.36 M stars < 2²⁴, so every count is exact in the
 * `f32` the shader ultimately reads.
 */
import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';

/** Per-catalog memo: the counts array is a pure function of the node table. */
const cache = new WeakMap<StarCatalog, readonly number[]>();

/** Pack (level, morton) into one integer key — mirrors `walkStarOctreeCut`. */
function nodeKey(level: number, morton: number): number {
  return level * 0x100000000 + morton;
}

/**
 * The subtree star count of every node in `catalog.nodes`, indexed parallel to
 * that array. Memoised on the catalog object, so the O(nodes) derivation runs
 * once per loaded catalog and every later frame is a map lookup.
 */
export function subtreeStarCounts(catalog: StarCatalog): readonly number[] {
  const cached = cache.get(catalog);
  if (cached) return cached;

  const { nodes } = catalog;

  // (level, morton) → node index, so an aggregate can find its present children.
  const nodeByKey = new Map<number, number>();
  for (let i = 0; i < nodes.length; i++) {
    nodeByKey.set(nodeKey(nodes[i]!.level, nodes[i]!.mortonIndex), i);
  }

  // Forward scan = children before parents (leaves first, then ascending level).
  const counts = new Array<number>(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.level === 0) {
      // A leaf's records ARE its real stars.
      counts[i] = node.recordCount;
      continue;
    }
    let sum = 0;
    const childLevel = node.level - 1;
    const baseMorton = node.mortonIndex << 3;
    for (let k = 0; k < 8; k++) {
      if ((node.childMask & (1 << k)) === 0) continue;
      const childIndex = nodeByKey.get(nodeKey(childLevel, baseMorton | k));
      if (childIndex !== undefined) sum += counts[childIndex]!;
    }
    counts[i] = sum;
  }

  cache.set(catalog, counts);
  return counts;
}
