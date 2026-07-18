/**
 * subtreeStarCounts — per octree node, how many real leaf stars live beneath it,
 * so the flux-glow shader can rebuild an aggregate's summed light from the
 * record's stored MEAN flux.
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
 * children.
 *
 * ── Derived once, in the shared load-time index ────────────────────────────
 *
 * The bottom-up count sum needs the exact same child resolution over the exact
 * same node table (in leaves-first / ascending-level order) that the per-frame
 * walk needs to descend the tree. So it is folded into the one forward scan
 * `starOctreeIndex` runs at load time rather than duplicated here; this function
 * is a thin accessor onto that memoised index's `subtreeCounts`, so the O(nodes)
 * derivation runs once per loaded catalog and every later frame is a field read.
 *
 * The largest tier holds ~13.36 M stars < 2²⁴, so every count is exact in the
 * `f32` the shader ultimately reads (and in the `u32` this array holds).
 */
import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import { starOctreeIndex } from './starOctreeIndex';

/**
 * The subtree star count of every node in `catalog.nodes`, indexed parallel to
 * that array. Memoised via `starOctreeIndex`, so repeated frames pay nothing.
 */
export function subtreeStarCounts(catalog: StarCatalog): Uint32Array {
  return starOctreeIndex(catalog).subtreeCounts;
}
