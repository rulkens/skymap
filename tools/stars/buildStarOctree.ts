/**
 * buildStarOctree — assemble Morton-sorted leaf stars into the
 * `{ nodes, records }` octree the star `.bin` format serializes.
 *
 * This is the stage between the Morton sort (Task 9) and the format encoder
 * (`starCatalogFormat.ts`). It groups the sorted stars into leaf cells, builds
 * aggregate levels bottom-up by flux-merging groups of ≤8 sibling cells, packs
 * every leaf and aggregate into a 6-byte record, and returns a pure
 * `StarCatalog`. No I/O — the caller owns fetching, sorting, and writing.
 *
 * ── The build, level by level ─────────────────────────────────────────────
 *
 * Level 0 (leaves): the input arrives sorted ascending by leaf-cell Morton
 * code, so a single linear scan cuts it into runs of equal `mortonIndex` —
 * each run is one leaf cell. A leaf node owns its run's stars
 * (`recordCount = stars in cell`, `level = 0`, `childMask = 0`).
 *
 * Levels ≥1 (aggregates): a parent's Morton code is its children's code shifted
 * right by 3 bits (`parent = child >> 3`), and which octant a child occupies is
 * the low 3 bits (`child & 7`). So grouping the previous level's nodes by
 * `morton >> 3` yields the parents; each parent's `childMask` ORs in
 * `1 << (childMorton & 7)` per present octant, and its single record is the
 * flux-merge of its children. Aggregation repeats until a level collapses to a
 * single root node; a catalog of one leaf cell needs no aggregates and emits
 * just that leaf.
 *
 * ── Why the aggregate record stores a MEAN magnitude ──────────────────────
 *
 * The merge carries `(totalFlux, starCount)` up the tree unquantized (see
 * `mergeFluxAggregate`), and the aggregate record is encoded from the
 * subtree's *mean* star flux — `aggregateMeanAbsMag = -2.5·log10(Σf / N)` — not
 * its summed flux. The record's 7-bit magnitude LUT is sized for a single star
 * (`[-6.0, +18.32]` mag); a summed-flux magnitude of thousands of stars is 10+
 * mag past the floor and would saturate index 0, flattening whole far-field
 * regions to one brightness. A mean of in-window fluxes stays in-window, so the
 * mean encode never clamps; the renderer multiplies the record's per-star flux
 * back up by the subtree star count (derived at runtime) to recover the exact
 * summed light. Position and colour stay the flux-weighted centroid the merge
 * computed.
 *
 * ── Coordinate frame for the flux merge ───────────────────────────────────
 *
 * The flux centroid must be computed in a frame shared across levels, so this
 * works in *leaf-cell grid units*: a star at in-cell offset `o` (0..1023) in
 * leaf cell `c` sits at `c + o/1024`. An aggregate at `level L` spans `2^L`
 * leaf cells per axis; its box origin in leaf-cell units is
 * `mortonDecode3(parentMorton) · 2^L`. To emit the aggregate's record its
 * flux centroid is re-quantized back into that box: `offset = ((centroid −
 * boxOrigin) / 2^L) · 1024`, clamped to 0..1023. That is the same
 * `cellOrigin + offset/1024 · cellEdge` reconstruction the renderer runs,
 * scaled by the node's level.
 *
 * ── On-disk layout invariants (plan 03's walker relies on these) ──────────
 *
 * NODE ORDER: leaves first, in ascending Morton order, followed by aggregates
 * ordered by ascending `level`, then ascending `mortonIndex` within a level.
 * So `nodes[0 .. starLeafCount)` are the level-0 leaves in Morton order, and
 * the tail is the aggregate pyramid, coarsening toward the final root node.
 *
 * RECORD ORDER: the record blob is all leaf star records first — grouped by
 * leaf node, in the same Morton order, each cell's stars contiguous — then one
 * aggregate record per aggregate node, in aggregate-node order. Hence
 * `firstRecord` for leaf `k` is the running star count, and for the `j`-th
 * aggregate it is `starCount + j`. `starCount` (leaf records) therefore also
 * marks the boundary between the two regions of the blob.
 */
import type { Vec3 } from '../../src/@types/math/Vec3';
import type { StarCatalog } from '../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogNode } from '../../src/@types/data/starCatalog/StarCatalogNode';
import { mortonDecode3 } from '../../src/utils/math/mortonDecode3';
import {
  packStarRecord,
  absMagToLutIndex,
  lutIndexToAbsMag,
  bpRpToColorIdx,
  RECORD_BYTES,
} from '../../src/data/starCatalog/starCatalogFormat';
import {
  mergeFluxAggregate,
  fluxFromAbsMag,
  aggregateMeanAbsMag,
  type FluxNode,
} from './mergeFluxAggregate';

/** One leaf star ready to place: its leaf cell, in-cell offset, and photometry. */
export type OctreeLeafStar = {
  /**
   * Leaf-cell Morton code; the input must be sorted ascending on this.
   * buildStarOctree throws if a later star's code is less than an earlier
   * one's.
   */
  readonly mortonIndex: number;
  /** In-cell integer offset per axis, 0..1023 (quantized upstream). */
  readonly offset: Vec3;
  /** Absolute magnitude — feeds the record LUT and the flux merge. */
  readonly absMag: number;
  /** Gaia BP-RP colour — feeds the record LUT and the flux merge. */
  readonly bpRp: number;
};

/** Grid geometry the octree carries through to the serialized header. */
export type StarOctreeGrid = {
  readonly mortonBitsPerAxis: number;
  readonly cellEdgePc: number;
  readonly gridOrigin: Vec3;
};

/** A node under construction, carrying its FluxNode for the next merge level. */
type LevelEntry = {
  readonly morton: number;
  readonly flux: FluxNode;
  readonly childMask: number;
};

/** Clamp `q` into the inclusive 10-bit offset range 0..1023. */
function clampOffset(q: number): number {
  if (q < 0) return 0;
  if (q > 1023) return 1023;
  return q;
}

/**
 * Re-quantize an aggregate's flux centroid (in leaf-cell units) into a 0..1023
 * in-cell offset within its level-`level` box rooted at `morton`.
 */
function aggregateOffset(centroid: Vec3, morton: number, level: number): Vec3 {
  const boxSize = 2 ** level; // box edge in leaf cells
  const [cx, cy, cz] = mortonDecode3(morton);
  return [
    clampOffset(Math.floor(((centroid[0] - cx * boxSize) / boxSize) * 1024)),
    clampOffset(Math.floor(((centroid[1] - cy * boxSize) / boxSize) * 1024)),
    clampOffset(Math.floor(((centroid[2] - cz * boxSize) / boxSize) * 1024)),
  ];
}

export function buildStarOctree(
  stars: readonly OctreeLeafStar[],
  grid: StarOctreeGrid,
): StarCatalog {
  const leafNodes: StarCatalogNode[] = [];
  const leafRecords: Uint8Array[] = [];
  // One entry per leaf cell, feeding the bottom-up aggregate merge.
  let currentLevel: LevelEntry[] = [];

  // ── Level 0: linear scan of the sorted input into leaf-cell runs ──────────
  let i = 0;
  // Sentinel below any real Morton code (codes are non-negative), so the
  // first star never trips the descending check below.
  let previousMorton = -1;
  while (i < stars.length) {
    const morton = stars[i]!.mortonIndex;
    if (morton < previousMorton) {
      throw new Error(
        `buildStarOctree: input violates its ascending-Morton-order precondition — ` +
          `star at index ${i} has mortonIndex ${morton}, which is less than the ` +
          `previous star's mortonIndex ${previousMorton}. Sort stars ascending by ` +
          `mortonIndex before calling buildStarOctree.`,
      );
    }
    previousMorton = morton;
    const firstRecord = leafRecords.length;
    const [cx, cy, cz] = mortonDecode3(morton);
    const cellFluxNodes: FluxNode[] = [];

    while (i < stars.length && stars[i]!.mortonIndex === morton) {
      const s = stars[i]!;
      const ox = clampOffset(Math.floor(s.offset[0]));
      const oy = clampOffset(Math.floor(s.offset[1]));
      const oz = clampOffset(Math.floor(s.offset[2]));
      const absMagIdx = absMagToLutIndex(s.absMag);
      leafRecords.push(packStarRecord([ox, oy, oz], absMagIdx, bpRpToColorIdx(s.bpRp)));
      // Star position in leaf-cell grid units, for the flux centroid. A single
      // star is a subtree of one: its flux is `totalFlux`, its `starCount` 1.
      //
      // The flux is the one the RECORD represents — `fluxFromAbsMag` of the
      // *dequantized* stored index, NOT the raw `s.absMag`. This is exactly the
      // flux the shader reconstructs from the leaf record, so an aggregate's
      // summed flux equals what its refined leaves would deposit (flux
      // conservation across the LOD transition). Using the raw magnitude would
      // let a star whose true absMag falls below the LUT's bright floor (a bad
      // parallax → an absurd luminosity) contribute an astronomically larger
      // flux to the mean than its clamped record ever deposits, dragging every
      // ancestor aggregate's mean to the bright floor.
      cellFluxNodes.push({
        position: [cx + ox / 1024, cy + oy / 1024, cz + oz / 1024],
        totalFlux: fluxFromAbsMag(lutIndexToAbsMag(absMagIdx)),
        starCount: 1,
        bpRp: s.bpRp,
      });
      i++;
    }

    leafNodes.push({
      mortonIndex: morton,
      level: 0,
      childMask: 0,
      firstRecord,
      recordCount: cellFluxNodes.length,
    });
    currentLevel.push({ morton, flux: mergeFluxAggregate(cellFluxNodes), childMask: 0 });
  }

  const starCount = leafRecords.length;

  // ── Levels ≥1: merge siblings (parent = morton >> 3) until a single root ──
  const aggregateNodes: StarCatalogNode[] = [];
  const aggregateRecords: Uint8Array[] = [];
  let level = 0;
  while (currentLevel.length > 1) {
    level++;
    // Group by parent Morton; insertion order is ascending because the child
    // level is ascending and `>> 3` is monotonic, so parents come out sorted.
    const parents = new Map<number, LevelEntry[]>();
    for (const entry of currentLevel) {
      const parentMorton = entry.morton >>> 3;
      const bucket = parents.get(parentMorton);
      if (bucket) bucket.push(entry);
      else parents.set(parentMorton, [entry]);
    }

    const nextLevel: LevelEntry[] = [];
    for (const [parentMorton, children] of parents) {
      let childMask = 0;
      for (const child of children) childMask |= 1 << (child.morton & 7);
      const flux = mergeFluxAggregate(children.map((c) => c.flux));
      nextLevel.push({ morton: parentMorton, flux, childMask });

      // Emit this aggregate's node + single re-quantized record now.
      aggregateNodes.push({
        mortonIndex: parentMorton,
        level,
        childMask,
        firstRecord: starCount + aggregateRecords.length,
        recordCount: 1,
      });
      aggregateRecords.push(
        packStarRecord(
          aggregateOffset(flux.position, parentMorton, level),
          // MEAN-flux magnitude — in-window by construction, so it never clamps.
          absMagToLutIndex(aggregateMeanAbsMag(flux)),
          bpRpToColorIdx(flux.bpRp),
        ),
      );
    }
    currentLevel = nextLevel;
  }

  // ── Concatenate records: all leaves, then all aggregates ──────────────────
  const nodes = [...leafNodes, ...aggregateNodes];
  const recordChunks = [...leafRecords, ...aggregateRecords];
  const records = new Uint8Array(recordChunks.length * RECORD_BYTES);
  for (let r = 0; r < recordChunks.length; r++) records.set(recordChunks[r]!, r * RECORD_BYTES);

  return {
    starCount,
    nodeCount: nodes.length,
    mortonBitsPerAxis: grid.mortonBitsPerAxis,
    cellEdgePc: grid.cellEdgePc,
    gridOrigin: grid.gridOrigin,
    nodes,
    records,
  };
}
