//! Tier truncation — port of `buildTier` in `buildStars.ts`: for each tier,
//! binary-search the largest main-star count `k` whose encoded+gzipped
//! catalog fits the tier's byte budget, keeping every supplement star.
//!
//! Two speed decisions over the TS shape:
//!
//! - **The three tier searches run in parallel** (they are independent reads
//!   of the same immutable sorted population), with a **shared probe cache**:
//!   `size(k)` depends only on `k`, not on the tier asking, so a probe one
//!   tier already paid for is free for another. The searches' first probe
//!   (`mid = mainCount >> 1`) always collides, and low-`k` probes often do.
//!   Only sizes are cached — catalogs are hundreds of MB and are rebuilt once
//!   at the end for the winning `k`.
//!
//! - **Probes gzip into a counting sink** (no output buffer): the search
//!   consumes only the compressed size.
//!
//! The search itself replicates the TS loop verbatim — same `(lo+hi)>>1`
//! midpoint, same `best = 0` floor probe, same `≤ budget` predicate — so
//! given the same size function it selects the same `k`. (The size function
//! differs from Node's zlib by whatever zlib-ng's deflate emits, which is why
//! the chosen `k` may sit a hair off the reference's — documented, expected.)

use crate::format::Grid;
use crate::octree::build_catalog;
use crate::population::Quantized;
use rustc_hash::FxHashMap;
use std::sync::Mutex;

pub const TIER_NAMES: [&str; 3] = ["small", "medium", "large"];
pub const TIER_BUDGET_BYTES: [u64; 3] = [10_000_000, 30_000_000, 75_000_000];

/// A tier that overshoots its budget by more than this trips the codec-ratio
/// STOP gate (deferred from the codec seal — see the TS module).
pub const CODEC_MISS_TOLERANCE: f64 = 1.2;

pub struct TierResult {
    pub tier: &'static str,
    pub k: u32,
    pub star_count: u32,
    pub node_count: u32,
    pub g_cut_mag: Option<f64>,
    pub raw_bytes: usize,
    pub compressed_bytes: u64,
    pub budget_bytes: u64,
    pub over_budget: bool,
    pub encoded: Vec<u8>,
}

fn probe_size(
    q: &Quantized,
    grid: Grid,
    cache: &Mutex<FxHashMap<u32, u64>>,
    k: u32,
    tier: &str,
) -> u64 {
    if let Some(&size) = cache.lock().unwrap().get(&k) {
        return size;
    }
    let cat = build_catalog(&q.sorted, k, grid);
    let size = cat.gzip_size();
    eprintln!(
        "  [{}] probe k={} → {} stars, {} nodes, gzip {} B",
        tier,
        k,
        cat.star_count,
        cat.nodes.len(),
        size
    );
    cache.lock().unwrap().insert(k, size);
    size
}

/// Run one tier's binary search and final encode. `cache` is shared across
/// the three concurrently-running tiers.
pub fn build_tier(
    q: &Quantized,
    tier_index: usize,
    cache: &Mutex<FxHashMap<u32, u64>>,
) -> TierResult {
    let tier = TIER_NAMES[tier_index];
    let budget = TIER_BUDGET_BYTES[tier_index];
    let grid = q.grid;
    let main_count = q.main_app_mags.len() as u32;

    // TS: bestEnc = encodeFor(0) first (the always-included supplement is the
    // valid floor), then the closed-interval binary search.
    let mut best: u32 = 0;
    let mut best_size = probe_size(q, grid, cache, 0, tier);
    let (mut lo, mut hi) = (0u32, main_count);
    while lo <= hi {
        let mid = (lo + hi) >> 1;
        let size = probe_size(q, grid, cache, mid, tier);
        if size <= budget {
            best = mid;
            best_size = size;
            if mid == u32::MAX {
                break; // cannot advance lo past mid (unreachable in practice)
            }
            lo = mid + 1;
        } else {
            if mid == 0 {
                break; // hi would underflow; k=0 already probed as the floor
            }
            hi = mid - 1;
        }
    }

    // Rebuild the winning catalog once, with a real output buffer this time.
    let cat = build_catalog(&q.sorted, best, grid);
    let encoded = cat.encode_gzip();
    debug_assert_eq!(encoded.len() as u64, best_size);
    let g_cut_mag = if best > 0 { Some(q.main_app_mags[best as usize - 1]) } else { None };

    TierResult {
        tier,
        k: best,
        star_count: cat.star_count,
        node_count: cat.nodes.len() as u32,
        g_cut_mag,
        raw_bytes: cat.raw_bytes(),
        compressed_bytes: encoded.len() as u64,
        budget_bytes: budget,
        over_budget: encoded.len() as f64 > budget as f64 * CODEC_MISS_TOLERANCE,
        encoded,
    }
}
