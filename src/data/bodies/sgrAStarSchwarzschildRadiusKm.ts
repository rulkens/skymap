/**
 * sgrAStarSchwarzschildRadiusKm — the one home for Sgr A*'s event-horizon scale
 * in kilometres, the sibling of `solarRadiusKm`.
 *
 * Sgr A* draws no geometry, so this is not a mesh size: it is the `radiusKm`
 * the body registry carries (and therefore the figure its InfoCard prints), and
 * the divisor that expresses an S-star pericentre in Schwarzschild radii. Two
 * readers, so one constant.
 *
 * `r_s = 2GM/c²` for `M = 4.297 × 10⁶ M☉` (GRAVITY Collaboration 2019, A&A 625,
 * L10 — the same orbit fit that gives the 8178 pc distance the anchor uses), or
 * 0.085 AU.
 */
export const SGR_A_STAR_SCHWARZSCHILD_RADIUS_KM = 12.69e6;
