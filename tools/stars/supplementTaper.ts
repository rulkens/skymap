/**
 * supplementTaper — thin out the GCNS supplement's outer edge so the local star
 * map fades into the survey background instead of ending at a hard shell.
 *
 * ── The problem this fixes ─────────────────────────────────────────────────
 *
 * The Gaia Catalogue of Nearby Stars supplement contributes the faint nearby
 * dwarfs the G<14 main cut never saw, and those rows are all inside ~100 pc.
 * Because supplements are exempt from per-tier apparent-magnitude truncation,
 * every one of them survives to every tier — so the built bin's flux density is
 * uniformly ~1.0–1.26 flux/pc³ from 0–100 pc, then steps DOWN 2.2× at exactly
 * 100 pc (measured on the large bin: 0.985 → 0.438 across the boundary). The
 * renderer draws that as a bright ball around the Sun with a hard edge — the
 * supplement's shell, not a real feature of the sky.
 *
 * ── The fix: a probabilistic outer taper ──────────────────────────────────
 *
 * Rather than a step at 100 pc, drop supplement stars with a probability that
 * ramps in over the outer 30 pc: keep everything inside 70 pc, then linearly
 * thin to zero at 100 pc. The density then eases into the survey floor instead
 * of falling off a cliff. Main-catalog stars are never touched at any distance:
 * a bright GCNS-region star that passed the survey cut is a *main* row, so the
 * taper only thins the faint supplement dwarfs crowding the shell.
 *
 * ── Why a hash, not an RNG ─────────────────────────────────────────────────
 *
 * The keep/drop coin is a pure hash of the star's Gaia DR3 `source_id`
 * (`splitmix64` → top-53-bit float in [0,1)), never a stateful PRNG. Two things
 * demand it: rebuilds must be byte-reproducible, and a parallel Rust builder is
 * compared against this one record-for-record — a stateful generator would make
 * the decision depend on iteration order and the two would disagree on which
 * dwarf near the shell survives. Hashing the identity makes the decision a pure
 * function of the star, independent of order and language.
 */

import { splitmix64 } from '../utils/random/splitmix64';

/** Inside this heliocentric radius (parsecs) every supplement star is kept. */
export const SUPPLEMENT_TAPER_START_PC = 70;

/** At and beyond this heliocentric radius (parsecs) every supplement star is dropped. */
export const SUPPLEMENT_TAPER_END_PC = 100;

/**
 * Map `source_id` to a uniform in [0,1) via splitmix64, taking the top 53 bits
 * (`>> 11`) so the value lands exactly on a double's mantissa. Both builders use
 * this same top-53-bit convention so float rounding cannot make the TS and Rust
 * keep/drop decisions diverge at the same star.
 */
function hash01(sourceId: bigint): number {
  return Number(splitmix64(sourceId) >> 11n) / 2 ** 53;
}

/**
 * Inclusion probability p(d) for a supplement star at heliocentric distance
 * `distPc`: 1 inside the taper start, 0 at/after the taper end, linear between.
 */
export function supplementInclusionProbability(distPc: number): number {
  if (distPc <= SUPPLEMENT_TAPER_START_PC) return 1;
  if (distPc >= SUPPLEMENT_TAPER_END_PC) return 0;
  return (SUPPLEMENT_TAPER_END_PC - distPc) / (SUPPLEMENT_TAPER_END_PC - SUPPLEMENT_TAPER_START_PC);
}

/**
 * Keep decision for a candidate population star. Main-catalog rows are always
 * kept — the taper only thins the GCNS supplement's outer shell. A supplement
 * star is kept iff its identity hash falls under the distance-dependent
 * inclusion probability, so the decision is a pure, order-free function of the
 * star (see the module header on determinism).
 */
export function keepStar(params: {
  sourceId: bigint;
  distPc: number;
  isSupplement: boolean;
}): boolean {
  if (!params.isSupplement) return true;
  return hash01(params.sourceId) < supplementInclusionProbability(params.distPc);
}
