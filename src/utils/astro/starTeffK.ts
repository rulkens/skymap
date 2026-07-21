/**
 * Effective temperature (kelvin) from a Gaia BP−RP colour via the
 * Mucciarelli, Bellazzini & Massari 2021 relation (A&A 653 A90,
 * arXiv:2106.03882), Table 1, at [Fe/H] = 0:
 *
 *   θ = 5040 / T_eff = b₀ + b₁·C + b₂·C²,   C = BP−RP
 *
 * The dwarf and giant coefficient sets (and their validity ranges) live in
 * `starTeffCoefficients`. The input colour is clamped into the applicable range
 * before evaluating: an out-of-range colour — a hot blue star or a very red M
 * dwarf — yields the boundary temperature rather than an extrapolated garbage
 * value. `deriveStarProperties` flags those clamped cases so the card can mark
 * them.
 *
 * Assumes solar metallicity and no extinction correction; a reddened distant
 * star reads too cool. These are order-of-magnitude estimates — the job is
 * separating dwarfs from giants, not stellar astrophysics.
 */
import { STAR_TEFF_COEFFICIENTS } from './starTeffCoefficients';

export function starTeffK(bpRp: number, kind: 'dwarf' | 'giant'): number {
  const { b0, b1, b2, cMin, cMax } = STAR_TEFF_COEFFICIENTS[kind];
  const c = Math.min(cMax, Math.max(cMin, bpRp));
  const theta = b0 + b1 * c + b2 * c * c;
  return 5040 / theta;
}
