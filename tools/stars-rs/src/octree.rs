//! Octree assembly — port of `tools/stars/buildStarOctree.ts` +
//! `mergeFluxAggregate.ts`, restructured around the pre-sorted population.
//!
//! The TS build re-sorts the tier selection by Morton code at every binary-
//! search probe (~25 sorts of up to 17 M stars per tier). Here the whole
//! population is sorted ONCE by `(morton, supplement-before-main, rank)`
//! (see `population::QuantStar::rank_field`), and a probe is a single linear
//! filter pass: keep supplements plus mains with brightness rank < k. A
//! filtered subsequence of that ordering is exactly what the TS per-probe
//! stable sort produces, so leaf-cell record order — and therefore the
//! serialized bytes — match the spec for every k.
//!
//! Aggregate levels replicate the TS grouping trick: the child level is
//! ascending by Morton, `>> 3` is monotonic, so parents emerge in ascending
//! order from a linear run-scan (the TS `Map` insertion order, without the
//! map). Flux math follows `mergeFluxAggregate` operation-for-operation.
//!
//! ── Leaf-capacity merge (fat leaves) — MIRROR of the TS builder ────────────
//!
//! `STAR_LEAF_CAPACITY` mirrors the TS constant of the same name and value.
//! When a would-be parent's subtree holds ≤ capacity stars it is emitted as a
//! FAT LEAF (`child_mask = 0`, `record_count = subtree star count`) holding all
//! the subtree's real stars re-expressed with 10-bit offsets in the parent's
//! larger cell — its children then vanish from the node table. A fat leaf still
//! carries its subtree `(total_flux, star_count)` up, so a yet-coarser parent
//! still ≤ capacity merges it AGAIN. Once a subtree exceeds capacity it becomes
//! a normal aggregate and every ancestor does too (the total only grows), so no
//! further leaf-merging happens on that path. The runtime discriminant is
//! `child_mask == 0` ⇒ leaf (at ANY level), never the level. This exists
//! because the old build made every occupied 1024³ cell a level-0 leaf and
//! sparse regions were almost all 1–2-star cells (the real large tier: 4.37 M
//! nodes for 8.28 M stars, median 1 star/leaf), and the node table evicts stars
//! from the gzip-budgeted tiers.
//!
//! ── Aggregates store a MEAN magnitude, carried unquantized ─────────────────
//!
//! Each `LevelEntry` carries `(total_flux, star_count)` — the summed linear
//! flux and leaf-star count of its subtree — UNQUANTIZED up the tree, and a
//! parent sums both from its children directly (never a magnitude that has
//! already been through the LUT). The aggregate record is then encoded from the
//! subtree's MEAN star flux, `-2.5·log10(total_flux / star_count)`, not the
//! summed flux. The record's 7-bit magnitude LUT is sized for a single star
//! (`[-6.0, +18.32]` mag); a summed magnitude of thousands of stars sits 10+
//! mag past the floor and saturates LUT index 0, flattening whole far-field
//! regions to one brightness. A mean of in-window fluxes stays in-window, so it
//! never clamps; the runtime multiplies the record's mean flux back up by the
//! subtree star count to recover the summed light. This matches the TS mean-
//! flux design exactly (no inter-level pow/log round-trip on either side). A
//! fat leaf needs none of this — it stores its real stars.

use crate::format::{Catalog, Grid, Node};
use crate::morton::morton_decode3;
use crate::population::{QuantStar, MAIN_BIT};
use crate::format::{abs_mag_to_lut_index, bp_rp_to_color_idx, pack_star_record};

/// Leaf-merge threshold — MIRROR of `STAR_LEAF_CAPACITY` in
/// `tools/stars/buildStarOctree.ts` (same value). A parent whose subtree holds
/// this many stars or fewer becomes one fat-leaf node instead of an aggregate
/// over its (then-omitted) children.
pub const STAR_LEAF_CAPACITY: u32 = 64;

/// A real star's already-quantized record fields, in some node's cell frame.
#[derive(Clone, Copy)]
struct LeafRecord {
    offset: [u32; 3],
    abs_mag_idx: u32,
    color_idx: u32,
}

/// A node awaiting the next merge level (TS `LevelEntry` + its `FluxNode`).
/// `records` is `Some` for a not-yet-emitted leaf/fat-leaf (still eligible to
/// fold into a coarser fat leaf), `None` for an aggregate (already emitted).
struct LevelEntry {
    morton: u32,
    level: u32,
    // FluxNode: centroid in leaf-cell grid units + merged photometry, carrying
    // the subtree's summed flux and star count UNQUANTIZED for the mean encode.
    px: f64,
    py: f64,
    pz: f64,
    total_flux: f64,
    star_count: u32,
    bp_rp: f64,
    records: Option<Vec<LeafRecord>>,
}

/// A node ready to serialize, plus the records it owns (pre firstRecord).
struct EmittedNode {
    morton: u32,
    level: u32,
    child_mask: u32,
    /// A leaf's real-star records, or an aggregate's single mean-flux record.
    records: Vec<LeafRecord>,
    is_aggregate: bool,
}

#[inline]
fn clamp_offset(q: f64) -> u32 {
    // floor then clamp to 0..1023, mirroring TS `clampOffset(Math.floor(x))`.
    let f = q.floor();
    if f < 0.0 {
        0
    } else if f > 1023.0 {
        1023
    } else {
        f as u32
    }
}

/// Fold a child cell's 10-bit offset into its parent's cell frame, one level up
/// — port of TS `foldOffset`. The child sits at octant bit `b` on this axis, so
/// the star at offset `o` lands at `floor((b·1024 + o) / 2)`, always in 0..1023.
#[inline]
fn fold_offset(o: u32, octant_bit: u32) -> u32 {
    (octant_bit * 1024 + o) >> 1
}

/// Unpack a packed 6-byte record (low 48 bits of a u64) into its fields — the
/// inverse of `pack_star_record`, used to fold a pending leaf's real stars.
#[inline]
fn unpack_leaf(rec: u64) -> LeafRecord {
    LeafRecord {
        offset: [
            (rec & 0x3ff) as u32,
            ((rec >> 10) & 0x3ff) as u32,
            ((rec >> 20) & 0x3ff) as u32,
        ],
        abs_mag_idx: ((rec >> 30) & 0x7f) as u32,
        color_idx: ((rec >> 37) & 0x3f) as u32,
    }
}

#[inline]
fn pack_leaf(r: &LeafRecord) -> u64 {
    pack_star_record(r.offset[0], r.offset[1], r.offset[2], r.abs_mag_idx, r.color_idx)
}

#[inline]
fn push_record(records: &mut Vec<u8>, rec: u64) {
    records.extend_from_slice(&rec.to_le_bytes()[..6]);
}

/// Re-quantize an aggregate's flux centroid into its level-`level` box —
/// port of `aggregateOffset`.
fn aggregate_offset(centroid: [f64; 3], morton: u32, level: u32) -> [u32; 3] {
    let box_size = (1u64 << level) as f64;
    let [cx, cy, cz] = morton_decode3(morton);
    [
        clamp_offset((centroid[0] - cx as f64 * box_size) / box_size * 1024.0),
        clamp_offset((centroid[1] - cy as f64 * box_size) / box_size * 1024.0),
        clamp_offset((centroid[2] - cz as f64 * box_size) / box_size * 1024.0),
    ]
}

/// Build the catalog for tier truncation `k`: every supplement star plus the
/// `k` brightest mains, from the population-wide selection-order sort.
pub fn build_catalog(sorted: &[QuantStar], k: u32, grid: Grid) -> Catalog {
    // Nodes are collected as they are emitted, then sorted into (level, morton)
    // node order at the end — mirroring the TS `emitted` list.
    let mut emitted: Vec<EmittedNode> = Vec::new();
    let mut current: Vec<LevelEntry> = Vec::new();

    // ── Level 0: linear scan into leaf-cell runs ──────────────────────────
    let included =
        |q: &QuantStar| q.rank_field & MAIN_BIT == 0 || (q.rank_field & !MAIN_BIT) < k;
    let mut it = sorted.iter().filter(|q| included(q)).peekable();
    while let Some(&first) = it.peek() {
        let morton = first.morton;
        // Flux merge of the cell's stars, summed in record order like the TS
        // `mergeFluxAggregate(cellFluxNodes)` loop.
        let (mut total_flux, mut x, mut y, mut z, mut c) = (0f64, 0f64, 0f64, 0f64, 0f64);
        let mut star_count: u32 = 0;
        let mut records: Vec<LeafRecord> = Vec::new();
        while let Some(&q) = it.peek() {
            if q.morton != morton {
                break;
            }
            records.push(unpack_leaf(q.record));
            total_flux += q.flux;
            x += q.fx;
            y += q.fy;
            z += q.fz;
            c += q.fc;
            star_count += 1;
            it.next();
        }
        // A level-0 cell is a pending leaf carrying its real stars.
        current.push(LevelEntry {
            morton,
            level: 0,
            px: x / total_flux,
            py: y / total_flux,
            pz: z / total_flux,
            total_flux,
            star_count,
            bp_rp: c / total_flux,
            records: Some(records),
        });
    }

    // ── Levels ≥1: merge sibling runs (parent = morton >> 3) to the root ──
    let mut level: u32 = 0;
    while current.len() > 1 {
        level += 1;
        let mut next: Vec<LevelEntry> = Vec::with_capacity(current.len() / 2 + 1);
        let mut i = 0;
        while i < current.len() {
            let parent_morton = current[i].morton >> 3;
            let group_start = i;
            let (mut total_flux, mut x, mut y, mut z, mut c) = (0f64, 0f64, 0f64, 0f64, 0f64);
            let mut star_count: u32 = 0;
            while i < current.len() && current[i].morton >> 3 == parent_morton {
                let child = &current[i];
                // Sum the child's UNQUANTIZED subtree flux + count (no pow/log
                // round-trip): flux-weight position/colour, accumulate the mean.
                let flux = child.total_flux;
                total_flux += flux;
                star_count += child.star_count;
                x += flux * child.px;
                y += flux * child.py;
                z += flux * child.pz;
                c += flux * child.bp_rp;
                i += 1;
            }
            let px = x / total_flux;
            let py = y / total_flux;
            let pz = z / total_flux;
            let bp_rp = c / total_flux;

            if star_count <= STAR_LEAF_CAPACITY {
                // FAT LEAF: fold every child's real stars up into this coarser
                // cell. Every child is a pending leaf here (its own subtree ≤
                // this total ≤ capacity), so `child.records` is `Some`.
                let mut records: Vec<LeafRecord> = Vec::new();
                for child in &current[group_start..i] {
                    let oct = child.morton & 7;
                    let bx = oct & 1;
                    let by = (oct >> 1) & 1;
                    let bz = (oct >> 2) & 1;
                    for r in child.records.as_ref().expect("pending leaf carries records") {
                        records.push(LeafRecord {
                            offset: [
                                fold_offset(r.offset[0], bx),
                                fold_offset(r.offset[1], by),
                                fold_offset(r.offset[2], bz),
                            ],
                            abs_mag_idx: r.abs_mag_idx,
                            color_idx: r.color_idx,
                        });
                    }
                }
                next.push(LevelEntry {
                    morton: parent_morton,
                    level,
                    px,
                    py,
                    pz,
                    total_flux,
                    star_count,
                    bp_rp,
                    records: Some(records),
                });
            } else {
                // AGGREGATE: emit any still-pending children as their own leaf
                // nodes (aggregate children are already emitted), then emit this
                // aggregate. Iterate by index so the `records` can be moved out.
                let mut child_mask: u32 = 0;
                for j in group_start..i {
                    child_mask |= 1 << (current[j].morton & 7);
                    if let Some(recs) = current[j].records.take() {
                        emitted.push(EmittedNode {
                            morton: current[j].morton,
                            level: current[j].level,
                            child_mask: 0,
                            records: recs,
                            is_aggregate: false,
                        });
                    }
                }
                // MEAN-flux magnitude for the record — in-window, never clamps.
                let abs_mag = -2.5 * (total_flux / star_count as f64).log10();
                let [ox, oy, oz] = aggregate_offset([px, py, pz], parent_morton, level);
                emitted.push(EmittedNode {
                    morton: parent_morton,
                    level,
                    child_mask,
                    records: vec![LeafRecord {
                        offset: [ox, oy, oz],
                        abs_mag_idx: abs_mag_to_lut_index(abs_mag),
                        color_idx: bp_rp_to_color_idx(bp_rp),
                    }],
                    is_aggregate: true,
                });
                next.push(LevelEntry {
                    morton: parent_morton,
                    level,
                    px,
                    py,
                    pz,
                    total_flux,
                    star_count,
                    bp_rp,
                    records: None,
                });
            }
        }
        current = next;
    }

    // The single surviving root is still pending iff it is a leaf/fat-leaf; an
    // aggregate root was already emitted when it was formed. Empty input emits
    // nothing.
    if let Some(root) = current.first_mut() {
        if let Some(recs) = root.records.take() {
            emitted.push(EmittedNode {
                morton: root.morton,
                level: root.level,
                child_mask: 0,
                records: recs,
                is_aggregate: false,
            });
        }
    }

    // ── Node order: ascending (level, morton) — children precede parents ──
    emitted.sort_by(|a, b| (a.level, a.morton).cmp(&(b.level, b.morton)));

    // Total real-star records (leaves + fat leaves) — the header `star_count`
    // and the boundary between the record blob's two regions.
    let star_count: u32 = emitted
        .iter()
        .filter(|e| !e.is_aggregate)
        .map(|e| e.records.len() as u32)
        .sum();

    // ── Assemble nodes + the two-region record blob ───────────────────────
    // Region one holds real-star records (leaves + fat leaves, in node order),
    // region two holds one aggregate record each — so a leaf's first_record
    // indexes region one and an aggregate's indexes region two (offset by
    // star_count).
    let mut nodes: Vec<Node> = Vec::with_capacity(emitted.len());
    let mut real_records: Vec<u8> = Vec::with_capacity(star_count as usize * 6);
    let mut aggregate_records: Vec<u8> = Vec::new();
    let mut real_count: u32 = 0;
    let mut aggregate_count: u32 = 0;
    for e in &emitted {
        if e.is_aggregate {
            nodes.push(Node {
                morton_index: e.morton,
                level: e.level as u8,
                child_mask: e.child_mask,
                first_record: star_count + aggregate_count,
                record_count: 1,
            });
            push_record(&mut aggregate_records, pack_leaf(&e.records[0]));
            aggregate_count += 1;
        } else {
            nodes.push(Node {
                morton_index: e.morton,
                level: e.level as u8,
                child_mask: 0,
                first_record: real_count,
                record_count: e.records.len() as u32,
            });
            for r in &e.records {
                push_record(&mut real_records, pack_leaf(r));
            }
            real_count += e.records.len() as u32;
        }
    }

    real_records.extend_from_slice(&aggregate_records);

    Catalog { star_count, grid, nodes, records: real_records }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::format::{unpack_star_record, RECORD_BYTES};
    use crate::morton::morton_encode3;

    fn star(morton: u32, rank_field: u32, offset: [u32; 3], abs_mag: f64, bp_rp: f64) -> QuantStar {
        // grid_pos in leaf-cell units, as quantize_population precomputes.
        let [cx, cy, cz] = morton_decode3(morton);
        let flux = 10f64.powf(-0.4 * abs_mag);
        QuantStar {
            morton,
            rank_field,
            record: pack_star_record(
                offset[0],
                offset[1],
                offset[2],
                abs_mag_to_lut_index(abs_mag),
                bp_rp_to_color_idx(bp_rp),
            ),
            flux,
            fx: flux * (cx as f64 + offset[0] as f64 / 1024.0),
            fy: flux * (cy as f64 + offset[1] as f64 / 1024.0),
            fz: flux * (cz as f64 + offset[2] as f64 / 1024.0),
            fc: flux * bp_rp,
        }
    }

    fn grid() -> Grid {
        Grid { morton_bits_per_axis: 9, cell_edge_pc: 1.0, origin: [0.0; 3] }
    }

    /// A well-separated star in a distinct top-level octant, so a small handful
    /// of them keep separate parents until high levels (used to force many
    /// nodes / an aggregate without exceeding the leaf capacity per subtree).
    fn far_star(gx: u32, gy: u32, gz: u32, rank_field: u32, abs_mag: f64) -> QuantStar {
        star(morton_encode3(gx, gy, gz), rank_field, [512, 512, 512], abs_mag, 0.5)
    }

    #[test]
    fn small_catalog_collapses_to_a_single_fat_leaf() {
        // Four stars across three nearby leaf cells: 4 ≤ STAR_LEAF_CAPACITY, so
        // the whole population folds up into ONE fat leaf (child_mask 0) holding
        // all four real records — no aggregate anywhere.
        let stars = vec![
            star(0, MAIN_BIT | 0, [100, 200, 300], 2.0, 0.5),
            star(0, MAIN_BIT | 1, [500, 500, 500], 3.0, 1.0),
            star(1, 0, [0, 0, 0], 4.0, 1.5),
            star(7, MAIN_BIT | 2, [512, 512, 512], 1.0, 0.1),
        ];
        let cat = build_catalog(&stars, u32::MAX & !MAIN_BIT, grid());

        assert_eq!(cat.star_count, 4);
        // Every node is a leaf (child_mask 0); exactly one node total.
        assert_eq!(cat.nodes.len(), 1);
        let root = &cat.nodes[0];
        assert_eq!(root.child_mask, 0, "collapsed root is a fat leaf");
        assert!(root.level > 0, "a merged fat leaf sits above level 0");
        assert_eq!(root.record_count, 4, "holds every real star");
        assert_eq!(root.first_record, 0);
        // The record blob is exactly the four folded real records, no aggregate.
        assert_eq!(cat.records.len(), 4 * RECORD_BYTES);
    }

    #[test]
    fn dense_cell_over_capacity_stays_a_level_0_leaf_under_an_aggregate() {
        // One dense cell (Morton 0) with capacity+1 stars — it cannot split, so
        // it stays a level-0 leaf — plus a lone far star, so a real aggregate
        // spans the two (their subtree exceeds the capacity, forcing aggregation
        // rather than a fat-leaf merge).
        let mut stars: Vec<QuantStar> = Vec::new();
        for r in 0..(STAR_LEAF_CAPACITY + 1) {
            stars.push(star(0, MAIN_BIT | r, [1, 2, 3], 5.0, 0.5));
        }
        stars.push(far_star(9, 9, 9, MAIN_BIT | 9999, 1.0));
        let cat = build_catalog(&stars, u32::MAX & !MAIN_BIT, grid());

        assert_eq!(cat.star_count, STAR_LEAF_CAPACITY + 2);
        // The dense cell survives as a level-0 leaf holding all its stars.
        let dense = cat
            .nodes
            .iter()
            .find(|n| n.level == 0 && n.morton_index == 0)
            .expect("dense cell stays a level-0 leaf");
        assert_eq!(dense.child_mask, 0);
        assert_eq!(dense.record_count, STAR_LEAF_CAPACITY + 1);
        // At least one real aggregate exists (child_mask != 0) — the merge did
        // NOT collapse everything, because the combined subtree exceeds capacity.
        assert!(
            cat.nodes.iter().any(|n| n.child_mask != 0),
            "an aggregate must span the dense cell and the far star"
        );
        // Node order is ascending (level, morton); the last node is the root.
        let keys: Vec<(u8, u32)> = cat.nodes.iter().map(|n| (n.level, n.morton_index)).collect();
        let mut sorted_keys = keys.clone();
        sorted_keys.sort();
        assert_eq!(keys, sorted_keys, "nodes ordered by (level, morton)");
    }

    #[test]
    fn fat_leaf_reconstructs_folded_positions_within_tolerance() {
        // Two stars in one leaf cell (Morton 0) fold up as the catalog collapses
        // to a single fat leaf. Each star's reconstructed position from the fat
        // leaf must land within one fat-leaf offset unit of its pre-merge
        // reconstruction on every axis (the fold halves resolution per level).
        let off_a = [100u32, 200, 300];
        let off_b = [900u32, 40, 700];
        let stars = vec![
            star(0, MAIN_BIT | 0, off_a, 2.0, 0.5),
            star(0, MAIN_BIT | 1, off_b, 3.0, 1.0),
        ];
        let cat = build_catalog(&stars, u32::MAX & !MAIN_BIT, grid());
        assert_eq!(cat.nodes.len(), 1);
        let leaf = &cat.nodes[0];
        assert_eq!(leaf.child_mask, 0);
        let l = leaf.level as u32;
        let box_cells = (1u64 << l) as f64; // fat-leaf box edge in leaf cells
        let [dx, dy, dz] = morton_decode3(leaf.morton_index);
        // Pre-merge reconstruction (level 0, cell Morton 0 at grid origin): a
        // star sits at offset/1024 leaf-cell units.
        let pre = |off: [u32; 3]| {
            [off[0] as f64 / 1024.0, off[1] as f64 / 1024.0, off[2] as f64 / 1024.0]
        };
        // The fat leaf reconstructs box_origin + offset/1024 · box_cells.
        let tol = box_cells / 1024.0 * 2.0; // ≤ 2 fat-leaf offset units of slack
        for at in 0..2usize {
            let ([ox, oy, oz], _a, _c) =
                unpack_star_record(&cat.records[at * RECORD_BYTES..]);
            let recon = [
                dx as f64 * box_cells + ox as f64 / 1024.0 * box_cells,
                dy as f64 * box_cells + oy as f64 / 1024.0 * box_cells,
                dz as f64 * box_cells + oz as f64 / 1024.0 * box_cells,
            ];
            // Records keep input order within a cell, so record 0 = star a.
            let want = if at == 0 { pre(off_a) } else { pre(off_b) };
            for axis in 0..3 {
                assert!(
                    (recon[axis] - want[axis]).abs() <= tol,
                    "axis {axis} star {at}: recon {} vs pre {} (tol {tol})",
                    recon[axis],
                    want[axis]
                );
            }
        }
    }

    #[test]
    fn truncation_keeps_supplements_and_brightest_k() {
        let stars = vec![
            star(0, 0, [1, 1, 1], 5.0, 0.2),            // supplement, always kept
            star(2, MAIN_BIT | 0, [2, 2, 2], 1.0, 0.3), // brightness rank 0
            star(3, MAIN_BIT | 1, [3, 3, 3], 2.0, 0.4), // rank 1 — dropped at k=1
        ];
        let cat = build_catalog(&stars, 1, grid());
        // Two stars survive (supplement + rank-0 main); rank-1 main is dropped.
        // With STAR_LEAF_CAPACITY they fold into a single fat leaf, so the
        // truncation is observed via the total real-star count.
        assert_eq!(cat.star_count, 2);
    }

    #[test]
    fn single_cell_catalog_has_no_aggregates() {
        let stars = vec![star(7, 0, [9, 9, 9], 3.0, 0.9)];
        let cat = build_catalog(&stars, 0, grid());
        assert_eq!(cat.nodes.len(), 1);
        assert_eq!(cat.nodes[0].level, 0);
        assert_eq!(cat.nodes[0].child_mask, 0);
        assert_eq!(cat.records.len(), RECORD_BYTES);
    }
}
