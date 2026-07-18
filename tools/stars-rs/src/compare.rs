//! Equivalence report — decode a reference `.bin` (built by the TS pipeline)
//! and a Rust-built catalog, and quantify every field-level difference.
//!
//! ── Why the Rust catalog is rebuilt at the *reference's* star count ───────
//!
//! The two builds choose their truncation `k` against their own gzip's
//! compressed sizes, so the shipped tiers may differ by a few thousand
//! faintest stars — comparing those directly would drown real differences in
//! expected selection skew. Instead the caller rebuilds a catalog at
//! `k = ref.starCount − supplementCount`, which selects the exact same star
//! *set* the reference encoded (same formula, same brightness order), and
//! this module then compares field-by-field. The only legitimate residual
//! differences are transcendental-ulp effects (V8's fdlibm sin/cos/pow/log
//! vs libm) flipping a floor() across a bin edge — a tiny fraction of
//! records, off by exactly one offset/LUT bin or one leaf cell.
//!
//! ── Matching strategy ─────────────────────────────────────────────────────
//!
//! Leaf stars are paired positionally within each leaf cell: both builds
//! order a cell's records by the same stable (supplement-first, then
//! brightness-rank) sequence, so record *i* of a cell corresponds to record
//! *i* — unless a boundary flip moved a star to a neighbouring cell, which
//! surfaces as a cell-count mismatch and is counted (and bounded) rather
//! than fuzzily re-matched. Aggregates are paired by their unique
//! `(level, morton)` key.

use crate::format::{
    unpack_star_record, Node, HEADER_BYTES, MAGIC, NODE_BYTES, RECORD_BYTES, VERSION,
};
use flate2::read::GzDecoder;
use rustc_hash::FxHashMap;
use std::io::Read;

pub struct DecodedBin {
    pub star_count: u32,
    pub morton_bits: u32,
    pub cell_edge_pc: f32,
    pub origin: [f64; 3],
    pub nodes: Vec<Node>,
    pub records: Vec<u8>,
}

/// Inflate + parse a `.bin`, mirroring the TS `decodeStarCatalog` checks.
pub fn decode_bin(bytes: &[u8]) -> DecodedBin {
    let mut plain = Vec::new();
    GzDecoder::new(bytes).read_to_end(&mut plain).expect("gzip inflate");
    let u32_at = |at: usize| u32::from_le_bytes(plain[at..at + 4].try_into().unwrap());
    assert_eq!(u32_at(0), MAGIC, "bad magic");
    assert_eq!(u32_at(4), VERSION, "bad version");
    let star_count = u32_at(8);
    let node_count = u32_at(12) as usize;
    let morton_bits = u32_at(16);
    let cell_edge_pc = f32::from_le_bytes(plain[20..24].try_into().unwrap());
    let origin = [
        f64::from_le_bytes(plain[24..32].try_into().unwrap()),
        f64::from_le_bytes(plain[32..40].try_into().unwrap()),
        f64::from_le_bytes(plain[40..48].try_into().unwrap()),
    ];
    let mut nodes = Vec::with_capacity(node_count);
    for i in 0..node_count {
        let base = HEADER_BYTES + i * NODE_BYTES;
        nodes.push(Node {
            morton_index: u32_at(base),
            level: plain[base + 4],
            child_mask: plain[base + 5] as u32
                | ((plain[base + 6] as u32) << 8)
                | ((plain[base + 7] as u32) << 16),
            first_record: u32_at(base + 8),
            record_count: u32_at(base + 12),
        });
    }
    let records_start = HEADER_BYTES + node_count * NODE_BYTES;
    let record_bytes = plain.len() - records_start;
    assert_eq!(record_bytes % RECORD_BYTES, 0, "truncated record region");
    DecodedBin {
        star_count,
        morton_bits,
        cell_edge_pc,
        origin,
        nodes,
        records: plain[records_start..].to_vec(),
    }
}

#[derive(Default)]
pub struct FieldDiff {
    pub compared: u64,
    pub identical: u64,
    /// Histogram of |Δ| per field for non-identical paired records; index 0
    /// counts diffs of exactly 1 bin, index 1 counts 2, index 2 counts ≥3.
    pub offset_delta: [u64; 3],
    pub abs_mag_delta: [u64; 3],
    pub color_delta: [u64; 3],
    /// Records that could not be paired (cell present in only one build, or
    /// count mismatch within a cell) — the boundary-flip population.
    pub unpaired: u64,
}

fn bump(hist: &mut [u64; 3], delta: u32) {
    if delta == 0 {
        return;
    }
    hist[(delta.min(3) - 1) as usize] += 1;
}

/// Compare leaf regions positionally per cell; returns the diff tally.
pub fn compare_leaves(a: &DecodedBin, b: &DecodedBin) -> FieldDiff {
    let cells = |bin: &DecodedBin| -> FxHashMap<u32, (u32, u32)> {
        bin.nodes
            .iter()
            .filter(|n| n.level == 0)
            .map(|n| (n.morton_index, (n.first_record, n.record_count)))
            .collect()
    };
    let ca = cells(a);
    let cb = cells(b);
    let mut d = FieldDiff::default();
    for (morton, &(fa, na)) in &ca {
        match cb.get(morton) {
            Some(&(fb, nb)) if nb == na => {
                for i in 0..na {
                    let ra = unpack_star_record(&a.records[(fa + i) as usize * RECORD_BYTES..]);
                    let rb = unpack_star_record(&b.records[(fb + i) as usize * RECORD_BYTES..]);
                    d.compared += 1;
                    if ra == rb {
                        d.identical += 1;
                    } else {
                        for axis in 0..3 {
                            bump(&mut d.offset_delta, ra.0[axis].abs_diff(rb.0[axis]));
                        }
                        bump(&mut d.abs_mag_delta, ra.1.abs_diff(rb.1));
                        bump(&mut d.color_delta, ra.2.abs_diff(rb.2));
                    }
                }
            }
            Some(&(_, nb)) => d.unpaired += (na.max(nb)) as u64,
            None => d.unpaired += na as u64,
        }
    }
    for (morton, &(_, nb)) in &cb {
        if !ca.contains_key(morton) {
            d.unpaired += nb as u64;
        }
    }
    d
}

/// Compare aggregate nodes+records by (level, morton). Returns (diff tally,
/// node-structure mismatches — child-mask or presence).
pub fn compare_aggregates(a: &DecodedBin, b: &DecodedBin) -> (FieldDiff, u64) {
    let index = |bin: &DecodedBin| -> FxHashMap<(u8, u32), (u32, u32)> {
        bin.nodes
            .iter()
            .filter(|n| n.level > 0)
            .map(|n| ((n.level, n.morton_index), (n.first_record, n.child_mask)))
            .collect()
    };
    let ia = index(a);
    let ib = index(b);
    let mut d = FieldDiff::default();
    let mut structure_mismatch = 0u64;
    for (key, &(fa, mask_a)) in &ia {
        match ib.get(key) {
            Some(&(fb, mask_b)) => {
                if mask_a != mask_b {
                    structure_mismatch += 1;
                }
                let ra = unpack_star_record(&a.records[fa as usize * RECORD_BYTES..]);
                let rb = unpack_star_record(&b.records[fb as usize * RECORD_BYTES..]);
                d.compared += 1;
                if ra == rb {
                    d.identical += 1;
                } else {
                    for axis in 0..3 {
                        bump(&mut d.offset_delta, ra.0[axis].abs_diff(rb.0[axis]));
                    }
                    bump(&mut d.abs_mag_delta, ra.1.abs_diff(rb.1));
                    bump(&mut d.color_delta, ra.2.abs_diff(rb.2));
                }
            }
            None => d.unpaired += 1,
        }
    }
    d.unpaired += ib.keys().filter(|k| !ia.contains_key(k)).count() as u64;
    (d, structure_mismatch)
}
