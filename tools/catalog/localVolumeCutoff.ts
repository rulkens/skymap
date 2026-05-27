/**
 * Distance below which we replace the cz-derived position with a
 * redshift-independent catalog measurement. The choice trades off
 * Hubble-flow accuracy against catalog coverage:
 *
 *   distance     Hubble cz     v_pec / cz error
 *   ────────     ─────────     ────────────────
 *   2 Mpc        140 km/s      ~200 %
 *   5 Mpc        350 km/s      ~85 %
 *   10 Mpc       700 km/s      ~40 %
 *   20 Mpc       1400 km/s     ~20 %
 *   30 Mpc       2100 km/s     ~15 %   ← the catalog stops winning here
 *
 * Past 30 Mpc the Hubble-law distance is good enough that the extra
 * dependency on CF4 / HyperLEDA isn't worth the complexity (per
 * resolved decision #1 in
 * docs/superpowers/specs/2026-05-27-local-volume-distances.md).
 *
 * Concretely this cutoff bounds the override to ~2,030 galaxies (the
 * CF4 ∩ GLADE PGC intersection for d < 30 Mpc); see the parser
 * module docstring for the broader coverage analysis.
 */
export const CUTOFF_MPC = 30;
