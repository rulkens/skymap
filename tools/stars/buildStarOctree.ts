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
 * each run is one candidate leaf cell owning its run's stars.
 *
 * Levels ≥1 (aggregates or FAT LEAVES): a parent's Morton code is its
 * children's code shifted right by 3 bits (`parent = child >> 3`), and which
 * octant a child occupies is the low 3 bits (`child & 7`). So grouping the
 * previous level's nodes by `morton >> 3` yields the parents. Each parent's
 * subtree star count decides its fate:
 *
 *   - subtree ≤ `STAR_LEAF_CAPACITY`: emit a FAT LEAF, not an aggregate — a
 *     leaf (`childMask = 0`, `recordCount = subtree star count`) holding all
 *     the subtree's real stars re-expressed with 10-bit offsets in the
 *     parent's (larger) cell. Its children do NOT appear in the node table
 *     (their records fold into the fat leaf). A fat leaf still carries its
 *     subtree's `(totalFlux, count)` up the tree, so a yet-coarser parent
 *     whose total is still ≤ capacity merges it AGAIN into an even coarser fat
 *     leaf. Each merge halves the in-cell offset resolution (a level-3 fat
 *     leaf still resolves ~0.18 pc), which the box scaling absorbs.
 *
 *   - subtree > `STAR_LEAF_CAPACITY`: emit a normal AGGREGATE — a `childMask`
 *     over its surviving children and a single mean-flux record. Once a
 *     subtree exceeds capacity every ancestor does too (the total only grows),
 *     so no further leaf-merging happens on that path.
 *
 * A dense finest cell with > capacity stars simply stays a level-0 leaf: it
 * cannot split further (capacity is a MERGE criterion, not a split guarantee),
 * so it is emitted the moment its parent aggregates.
 *
 * The resulting invariant the runtime relies on: **leaf (real star records) ⇔
 * `childMask === 0`, at ANY level; aggregate ⇔ `childMask !== 0`, always
 * `recordCount === 1`.** Level no longer discriminates — a fat leaf lives at
 * `level > 0` yet is a leaf. Every aggregate's subtree star count is > capacity
 * (a smaller subtree would have merged), but the runtime uses `childMask`, not
 * counts, to tell the two apart.
 *
 * ── Why merge sparse leaves at all ────────────────────────────────────────
 *
 * `STAR_LEAF_CAPACITY` exists because a fixed finest grid makes EVERY occupied
 * finest cell a level-0 leaf, and sparse regions are almost all 1–2-star cells.
 * On the real large tier that produced 4.37 M nodes for 8.28 M stars (median 1
 * star/leaf), and at 16 B/node the node table dominates the gzip-budgeted tier
 * files: node overhead directly EVICTS stars (each tier packs as many stars as
 * fit a fixed compressed byte budget), so the large tier had dropped from
 * 13.4 M to 8.3 M stars, and the runtime's load-time index burned ~270 MB.
 * Folding sparse subtrees into fat leaves collapses those millions of tiny
 * nodes back into a handful of records.
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
 * computed. (A fat leaf needs none of this: it stores its real stars, so its
 * light is exact without any mean/count reconstruction.)
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
 * scaled by the node's level. The fat-leaf RECORD offsets are re-expressed by
 * a separate per-level fold (see `foldOffset`), independent of this centroid.
 *
 * ── On-disk layout invariants (plan 03's walker relies on these) ──────────
 *
 * NODE ORDER: all nodes sorted by ascending `level`, then ascending
 * `mortonIndex` within a level — leaves (level-0 and fat), and aggregates,
 * interleaved by level. Children still precede parents (a node's surviving
 * children sit one level below it, and merged children simply don't exist), so
 * a forward scan visits every child before its parent, and the final node is
 * the single root.
 *
 * RECORD ORDER: the record blob is all REAL-star records first — every leaf and
 * fat-leaf's stars, grouped by node in node-table order, each node's stars
 * contiguous — then one aggregate record per aggregate node, in aggregate-node
 * order. Hence `starCount` (the total real-star record count) marks the
 * boundary between the two regions of the blob; a leaf/fat-leaf's `firstRecord`
 * indexes region one, an aggregate's indexes region two.
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

/**
 * Leaf-merge threshold: a would-be parent whose subtree holds this many stars
 * or fewer is emitted as a single FAT LEAF instead of an aggregate over its
 * children (whose nodes then vanish from the table).
 *
 * The number is chosen against a real-tier measurement. The old build made
 * every occupied finest (1024³, ~23 pc) cell a level-0 leaf; the large tier
 * then held 4.37 M nodes for 8.28 M stars — a MEDIAN of one star per leaf, so
 * the node table (16 B/node) was almost pure per-star overhead. Because each
 * tier packs as many stars as fit a fixed *compressed* byte budget, that node
 * overhead evicts stars one-for-one: the large tier had already fallen from
 * 13.4 M to 8.3 M stars, and the runtime's load-time index burned ~270 MB.
 * Merging subtrees of ≤64 stars into one fat-leaf node collapses the millions
 * of tiny sparse-region leaves while keeping dense cores (which exceed the
 * threshold, so stay refined) untouched.
 */
export const STAR_LEAF_CAPACITY = 64;

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

/** A real star's already-quantized record fields, in some node's cell frame. */
type LeafRecord = {
  /** 10-bit in-cell offset per axis (0..1023), in the OWNING node's cell frame. */
  readonly offset: Vec3;
  readonly absMagIdx: number;
  readonly colorIdx: number;
};

/**
 * A node under construction at the current merge level, carrying its FluxNode
 * for the next level. `records` is non-null for a not-yet-emitted LEAF (either
 * a level-0 cell or a fat leaf) — it holds the leaf's real stars in this node's
 * cell frame, still eligible to fold up into a coarser fat leaf. It is null for
 * an AGGREGATE, which is emitted the moment it is formed and never folds again.
 */
type LevelEntry = {
  readonly morton: number;
  readonly level: number;
  readonly flux: FluxNode;
  readonly childMask: number;
  readonly records: LeafRecord[] | null;
};

/** A node ready to serialize, plus the records it owns (before firstRecord assignment). */
type EmittedNode = {
  readonly morton: number;
  readonly level: number;
  readonly childMask: number;
  /** A leaf's real-star records, or the aggregate's single mean-flux record. */
  readonly records: readonly LeafRecord[];
  readonly isAggregate: boolean;
};

/** Clamp `q` into the inclusive 10-bit offset range 0..1023. */
function clampOffset(q: number): number {
  if (q < 0) return 0;
  if (q > 1023) return 1023;
  return q;
}

/**
 * Re-express a child cell's 10-bit in-cell offset in its parent's (2× larger)
 * cell frame, one merge level up. The child sits at octant bit `b` on this axis
 * (0 = low half of the parent cell, 1 = high half), so its whole span maps into
 * `[b, b+1)` of the parent's two child-cell units; the star at offset `o`
 * therefore lands at parent offset `floor((b·1024 + o) / 2)`, always in 0..1023.
 * Each level applies one fold, halving the in-cell resolution.
 */
function foldOffset(o: number, octantBit: number): number {
  return (octantBit * 1024 + o) >> 1;
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
  // Nodes are collected as they are emitted, in no particular order, then sorted
  // into (level, morton) node order at the end. A node is emitted either as an
  // aggregate (the moment its parent group exceeds capacity) or as a leaf/fat
  // leaf (the moment its parent aggregates, or as the root once the merge ends).
  const emitted: EmittedNode[] = [];

  function emitLeaf(entry: LevelEntry): void {
    // `records` is non-null for any pending leaf/fat-leaf (the only entries that
    // reach here); a caller passing an aggregate entry would be a build bug.
    emitted.push({
      morton: entry.morton,
      level: entry.level,
      childMask: 0,
      records: entry.records!,
      isAggregate: false,
    });
  }

  function emitAggregate(morton: number, level: number, childMask: number, flux: FluxNode): void {
    emitted.push({
      morton,
      level,
      childMask,
      records: [
        {
          offset: aggregateOffset(flux.position, morton, level),
          // MEAN-flux magnitude — in-window by construction, so it never clamps.
          absMagIdx: absMagToLutIndex(aggregateMeanAbsMag(flux)),
          colorIdx: bpRpToColorIdx(flux.bpRp),
        },
      ],
      isAggregate: true,
    });
  }

  // ── Level 0: linear scan of the sorted input into leaf-cell runs ──────────
  let currentLevel: LevelEntry[] = [];
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
    const [cx, cy, cz] = mortonDecode3(morton);
    const cellRecords: LeafRecord[] = [];
    const cellFluxNodes: FluxNode[] = [];

    while (i < stars.length && stars[i]!.mortonIndex === morton) {
      const s = stars[i]!;
      const ox = clampOffset(Math.floor(s.offset[0]));
      const oy = clampOffset(Math.floor(s.offset[1]));
      const oz = clampOffset(Math.floor(s.offset[2]));
      const absMagIdx = absMagToLutIndex(s.absMag);
      const colorIdx = bpRpToColorIdx(s.bpRp);
      cellRecords.push({ offset: [ox, oy, oz], absMagIdx, colorIdx });
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

    // A level-0 cell is a pending leaf: it carries its real stars and may fold
    // up into a fat leaf if its subtree stays within capacity.
    currentLevel.push({
      morton,
      level: 0,
      flux: mergeFluxAggregate(cellFluxNodes),
      childMask: 0,
      records: cellRecords,
    });
  }

  // ── Levels ≥1: merge sibling runs (parent = morton >> 3) until a single root ─
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
      const flux = mergeFluxAggregate(children.map((c) => c.flux));

      if (flux.starCount <= STAR_LEAF_CAPACITY) {
        // FAT LEAF: fold every child's real stars up into this coarser cell.
        // Every child is a pending leaf here (its own subtree ≤ this total ≤
        // capacity, so it can only be a not-yet-emitted leaf/fat-leaf), so
        // `child.records` is guaranteed non-null.
        const records: LeafRecord[] = [];
        for (const child of children) {
          const oct = child.morton & 7;
          const bx = oct & 1;
          const by = (oct >> 1) & 1;
          const bz = (oct >> 2) & 1;
          for (const r of child.records!) {
            records.push({
              offset: [foldOffset(r.offset[0], bx), foldOffset(r.offset[1], by), foldOffset(r.offset[2], bz)],
              absMagIdx: r.absMagIdx,
              colorIdx: r.colorIdx,
            });
          }
        }
        nextLevel.push({ morton: parentMorton, level, flux, childMask: 0, records });
      } else {
        // AGGREGATE: emit any still-pending children as their own leaf nodes
        // (aggregate children are already emitted), then emit this aggregate.
        let childMask = 0;
        for (const child of children) {
          childMask |= 1 << (child.morton & 7);
          if (child.records !== null) emitLeaf(child);
        }
        emitAggregate(parentMorton, level, childMask, flux);
        nextLevel.push({ morton: parentMorton, level, flux, childMask, records: null });
      }
    }
    currentLevel = nextLevel;
  }

  // The single surviving root is still pending iff it is a leaf/fat-leaf (a
  // single-cell catalog, or a whole population that folded into one fat leaf);
  // an aggregate root was already emitted when it was formed. An empty input
  // leaves `currentLevel` empty and emits nothing.
  const root = currentLevel[0];
  if (root && root.records !== null) emitLeaf(root);

  // ── Node order: ascending (level, morton) — children precede parents ──────
  emitted.sort((a, b) => a.level - b.level || a.morton - b.morton);

  // Total real-star records (every leaf + fat-leaf's stars) — the header
  // `starCount` and the boundary between the record blob's two regions.
  let starCount = 0;
  for (const e of emitted) if (!e.isAggregate) starCount += e.records.length;

  // ── Assemble nodes + the two-region record blob ───────────────────────────
  // Region one holds real-star records (leaves + fat leaves, in node order),
  // region two holds one aggregate record each — so a leaf's firstRecord indexes
  // region one and an aggregate's indexes region two (offset by starCount).
  const nodes: StarCatalogNode[] = new Array(emitted.length);
  const realStarRecords: LeafRecord[] = [];
  const aggregateRecords: LeafRecord[] = [];
  for (let n = 0; n < emitted.length; n++) {
    const e = emitted[n]!;
    if (e.isAggregate) {
      nodes[n] = {
        mortonIndex: e.morton,
        level: e.level,
        childMask: e.childMask,
        firstRecord: starCount + aggregateRecords.length,
        recordCount: 1,
      };
      aggregateRecords.push(e.records[0]!);
    } else {
      nodes[n] = {
        mortonIndex: e.morton,
        level: e.level,
        childMask: 0,
        firstRecord: realStarRecords.length,
        recordCount: e.records.length,
      };
      for (const r of e.records) realStarRecords.push(r);
    }
  }

  const allRecords = [...realStarRecords, ...aggregateRecords];
  const records = new Uint8Array(allRecords.length * RECORD_BYTES);
  for (let r = 0; r < allRecords.length; r++) {
    const rec = allRecords[r]!;
    records.set(packStarRecord(rec.offset, rec.absMagIdx, rec.colorIdx), r * RECORD_BYTES);
  }

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
