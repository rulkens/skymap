/**
 * Mucciarelli, Bellazzini & Massari 2021 (A&A 653 A90, arXiv:2106.03882),
 * Table 1 — the θ = 5040/T_eff = b₀ + b₁·C + b₂·C² colour–temperature relation
 * for Gaia (BP−RP)₀, evaluated at [Fe/H] = 0 (the metallicity terms drop, so a
 * field star with no measured metallicity is treated as solar).
 *
 * The paper splits dwarfs from giants at log g = 3 and notes the two relations
 * differ by only 10–20 K at the boundary, so a crude photometric dwarf/giant
 * split (see `isGiantStar`) costs at most tens of kelvin — negligible for the
 * order-of-magnitude estimates the InfoCard shows.
 *
 * `cMin`/`cMax` are the paper's stated validity range for each relation. They
 * live here as the single source of truth: `starTeffK` clamps the input colour
 * into the range before evaluating, and `deriveStarProperties` compares the raw
 * colour against the same bounds to raise its `extrapolated` flag. Keeping one
 * copy avoids the two consumers silently drifting apart.
 */
export const STAR_TEFF_COEFFICIENTS = {
  dwarf: { b0: 0.4929, b1: 0.5092, b2: -0.0353, cMin: 0.39, cMax: 1.5 },
  giant: { b0: 0.5323, b1: 0.4775, b2: -0.0344, cMin: 0.33, cMax: 1.81 },
} as const;
