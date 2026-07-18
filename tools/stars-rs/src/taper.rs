//! taper — thin the GCNS supplement's outer edge so the local star map fades
//! into the survey background instead of ending at a hard shell. Port of
//! `tools/stars/supplementTaper.ts` (+ `tools/utils/random/splitmix64.ts`).
//!
//! ── The problem this fixes ─────────────────────────────────────────────────
//!
//! The GCNS supplement contributes the faint nearby dwarfs the G<14 main cut
//! never saw, all inside ~100 pc, and supplements are exempt from per-tier
//! apparent-magnitude truncation — so every one survives to every tier. The
//! built bin's flux density is uniformly ~1.0–1.26 flux/pc³ from 0–100 pc, then
//! steps DOWN 2.2× at exactly 100 pc (measured on the large bin: 0.985 → 0.438
//! across the boundary). The renderer draws that as a bright ball around the Sun
//! with a hard edge — the supplement's shell, not a real feature of the sky.
//!
//! ── The fix: a probabilistic outer taper ──────────────────────────────────
//!
//! Keep everything inside 70 pc, then linearly thin the keep probability to
//! zero at 100 pc, so the density eases into the survey floor. Main-catalog
//! stars are never touched: a bright GCNS-region star that passed the survey cut
//! is a *main* row, so the taper only thins the faint supplement dwarfs.
//!
//! ── Why a hash, not an RNG ─────────────────────────────────────────────────
//!
//! The keep/drop coin is a pure hash of the star's Gaia DR3 `source_id`
//! (`splitmix64` → top-53-bit float in [0,1)), never a stateful PRNG. This Rust
//! builder is compared record-for-record against the TS one, and rebuilds must
//! be byte-reproducible — a stateful generator would make the decision depend on
//! iteration order and the two would disagree on which shell dwarf survives.
//! Hashing the identity makes the decision a pure, order- and language-free
//! function of the star. The `wrapping_*` u64 arithmetic mirrors the TS BigInt
//! `& 0xFFFF…` masking exactly, and the `>> 11` top-53-bit convention matches so
//! float rounding cannot make the two languages diverge at the same star.

/// Inside this heliocentric radius (parsecs) every supplement star is kept.
pub const SUPPLEMENT_TAPER_START_PC: f64 = 70.0;

/// At and beyond this heliocentric radius (parsecs) every supplement star is dropped.
pub const SUPPLEMENT_TAPER_END_PC: f64 = 100.0;

/// Reference splitmix64 (Steele, Lea & Flood, 2014). Known answer:
/// `splitmix64(0) = 0xE220A8397B1DCDAF`.
fn splitmix64(x: u64) -> u64 {
    let mut z = x.wrapping_add(0x9E3779B97F4A7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

/// Map `source_id` to a uniform in [0,1) via splitmix64, taking the top 53 bits
/// (`>> 11`) so the value lands exactly on an f64 mantissa.
fn hash01(source_id: u64) -> f64 {
    (splitmix64(source_id) >> 11) as f64 / (1u64 << 53) as f64
}

/// Inclusion probability p(d) for a supplement star at heliocentric distance
/// `dist_pc`: 1 inside the taper start, 0 at/after the taper end, linear between.
fn inclusion_probability(dist_pc: f64) -> f64 {
    if dist_pc <= SUPPLEMENT_TAPER_START_PC {
        1.0
    } else if dist_pc >= SUPPLEMENT_TAPER_END_PC {
        0.0
    } else {
        (SUPPLEMENT_TAPER_END_PC - dist_pc) / (SUPPLEMENT_TAPER_END_PC - SUPPLEMENT_TAPER_START_PC)
    }
}

/// Keep decision for a candidate population star. Main-catalog rows are always
/// kept — the taper only thins the GCNS supplement's outer shell. A supplement
/// star is kept iff its identity hash falls under the distance-dependent
/// inclusion probability (see the module header on determinism).
pub fn keep_star(source_id: u64, dist_pc: f64, is_supplement: bool) -> bool {
    if !is_supplement {
        return true;
    }
    hash01(source_id) < inclusion_probability(dist_pc)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splitmix64_known_answer() {
        // The canonical reference vector — if the constants or schedule drift,
        // this changes. Must equal the TS `splitmix64(0n)` for the two builders
        // to agree record-for-record.
        assert_eq!(splitmix64(0), 0xE220A8397B1DCDAF);
    }

    #[test]
    fn keeps_inside_taper_start_drops_beyond_end() {
        assert!(keep_star(12345, 60.0, true));
        assert!(keep_star(999_999_999_999, 60.0, true));
        assert!(!keep_star(12345, 100.0, true));
        assert!(!keep_star(999_999_999_999, 110.0, true));
    }

    #[test]
    fn decides_85pc_star_by_identity_hash() {
        // p = 0.5 at 85 pc. Real Gaia DR3 ids whose hash01 was computed from
        // this implementation: Barnard's Star (≈0.4735 < 0.5 → kept), Ross 154
        // (≈0.9589 ≥ 0.5 → dropped). Flips if the hash schedule drifts.
        assert!(keep_star(4472832130942575872, 85.0, true));
        assert!(!keep_star(4075141768785646848, 85.0, true));
    }

    #[test]
    fn never_taper_drops_a_main_star() {
        // Ross 154's hash would drop it as a supplement at 85 pc; as a main row
        // it is kept unconditionally, at any distance.
        assert!(keep_star(4075141768785646848, 85.0, false));
        assert!(keep_star(4075141768785646848, 99.0, false));
    }
}
