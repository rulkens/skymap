/**
 * DESI_CONE — the ultra-deep-cone center, single source of truth for both
 * the build (`loadDesi` in `buildAllBins.ts`, which cone-filters the four
 * DESI DR1 LSS clustering FITS files down to the rows worth shipping) and
 * the `desi-cone-census` diagnostic (which re-checks whether a nearby
 * center would pack the cone denser).
 *
 * RA 233.2°, Dec +32.3°, radius 2.5° targets the Corona Borealis
 * supercluster: it packs several rich Abell clusters (A2065, A2061, A2067,
 * A2079) at z ≈ 0.07–0.11 into one line of sight, which is what gives the
 * deep cone its guaranteed fingers-of-god rather than density luck. Chosen
 * by a live sampling spike across all eight DR1 tracer×cap files
 * (see `docs/superpowers/specs/2026-07-07-desi-deep-cone-design.md`) —
 * ~2× denser in every tracer than the runner-up candidates.
 *
 * The center is deliberately isolated in its own module (rather than a
 * literal inside `buildAllBins.ts` or `desiConeCensus.ts`) so a future
 * re-center — the census diagnostic's whole reason for existing — is a
 * one-line edit in exactly one file, per the design spec's decision #4.
 */
export const DESI_CONE = { raDeg: 233.2, decDeg: 32.3, radiusDeg: 2.5 } as const;
