/**
 * resolveStarRecord — turn a bin-stable global star record index (what the pick
 * texture names for a picked star) into the star it identifies: heliocentric
 * world position in Mpc plus the dequantised absolute magnitude and BP-RP
 * colour. This is the load-bearing "the pick names the right star" resolver;
 * `extractSelectionRow`'s star arm reads through it.
 *
 * ── Why binary-search the LEAF nodes, not the whole node table ─────────────
 *
 * The record blob has two regions: every REAL-star record first (leaves and fat
 * leaves, `[0, starCount)`), then one aggregate record per interior node
 * (`[starCount, …)`) — see `buildStarOctree`. A picked star is always a
 * real-star record, so its index lives in region one and its owner is a LEAF
 * node (`childMask === 0`).
 *
 * `catalog.nodes` is ordered by ascending `(level, mortonIndex)`, NOT by
 * firstRecord. Because leaves and aggregates interleave by level (a fat leaf at
 * level L can follow an aggregate at level < L), the nodes' firstRecord sequence
 * is non-monotonic — an aggregate's `firstRecord ≥ starCount` can sit in array
 * order BEFORE a later fat leaf's `firstRecord < starCount`. So a binary search
 * over the whole table on firstRecord is wrong. The LEAF subsequence, however,
 * is strictly increasing in firstRecord (region one is filled in node order,
 * one leaf's records after another's), so we search that. A single O(nodes)
 * filter builds it, memoised per (immutable) catalog — mirroring
 * `starOctreeIndex` — so a pick is O(log leaves) after the first.
 *
 * ── Why reuse starNodeOriginRelCamMpc for the reconstruction ───────────────
 *
 * The star's world position is reconstructed with the SAME formula the renderer
 * draws it with (`starNodeOriginRelCamMpc`), run at a zero camera position to
 * get the heliocentric node origin. Sharing the one formula is what guarantees
 * the pick lands exactly where the sprite was drawn — a re-derivation here could
 * drift from the renderer and name a star slightly off from the pixel clicked.
 */
import type { Vec3 } from '../../../@types/math/Vec3';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogNode } from '../../../@types/data/starCatalog/StarCatalogNode';
import {
  unpackStarRecord,
  lutIndexToAbsMag,
  colorIdxToBpRp,
  RECORD_BYTES,
  STAR_OFFSET_LEVELS,
} from '../../../data/starCatalog/starCatalogFormat';
import { starNodeOriginRelCamMpc } from '../../gpu/renderers/starCatalog/starNodeOriginRelCamMpc';

/** Heliocentric camera position — the reconstruction wants the world origin. */
const SUN: Vec3 = [0, 0, 0];

/**
 * Per-catalog memo of the leaf-node subsequence, in node order (hence strictly
 * increasing by firstRecord). The node table is immutable, so this is a pure
 * function of the catalog — cached like `starOctreeIndex`.
 */
const leafCache = new WeakMap<StarCatalog, readonly StarCatalogNode[]>();

function leafNodes(catalog: StarCatalog): readonly StarCatalogNode[] {
  const cached = leafCache.get(catalog);
  if (cached) return cached;
  // `childMask === 0` ⇒ a leaf (real star records) at ANY level — the runtime
  // discriminant, never the level (a fat leaf lives above level 0).
  const leaves = catalog.nodes.filter((n) => n.childMask === 0);
  leafCache.set(catalog, leaves);
  return leaves;
}

export function resolveStarRecord(
  catalog: StarCatalog,
  recordIndex: number,
): { positionMpc: Vec3; absMag: number; bpRp: number } | null {
  const leaves = leafNodes(catalog);

  // Largest leaf whose firstRecord ≤ recordIndex. A negative / NaN index never
  // satisfies the predicate, so `found` stays -1 → null.
  let lo = 0;
  let hi = leaves.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (leaves[mid]!.firstRecord <= recordIndex) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;

  const node = leaves[found]!;
  // Region one is gap-free, so a valid real-star index always lands inside its
  // owning leaf's slice; an index ≥ starCount lands on the last leaf but beyond
  // its records — the range check rejects it as out of range.
  if (recordIndex >= node.firstRecord + node.recordCount) return null;

  const { offset, absMagIdx, colorIdx } = unpackStarRecord(
    catalog.records,
    recordIndex * RECORD_BYTES,
  );

  // Reconstruct via the renderer's shared formula (camera at the Sun ⇒ the
  // node's heliocentric origin), then add the record's in-cell offset scaled by
  // the node's box. This inverts exactly what the shader draws.
  const { originRelCamMpc, cellScaleMpc } = starNodeOriginRelCamMpc(catalog, node, SUN);
  const positionMpc: Vec3 = [
    originRelCamMpc[0] + (offset[0] / STAR_OFFSET_LEVELS) * cellScaleMpc,
    originRelCamMpc[1] + (offset[1] / STAR_OFFSET_LEVELS) * cellScaleMpc,
    originRelCamMpc[2] + (offset[2] / STAR_OFFSET_LEVELS) * cellScaleMpc,
  ];

  return { positionMpc, absMag: lutIndexToAbsMag(absMagIdx), bpRp: colorIdxToBpRp(colorIdx) };
}
