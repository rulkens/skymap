/**
 * Diffuse ionized gas (DIG) veil — see `GalaxyHiiDigTuning`'s doc for the
 * observational anchor. A complex/children group (`buildDigVeil`) pushed
 * AFTER the catalog regions, not a per-region add-on: DIG isn't tied to any
 * one HII event, it is a separate haze the arms and knots sit inside.
 */
/**
 * Per-blob sigma range, parsecs — wide enough that a complex's blobs read as
 * a continuous wash rather than a second population of dots (no blur pass;
 * this range IS the smoothing). Exported for `computeDigVeilBudget.ts`
 * (Task 8's GPU-side budget math) — no logic change, same "reservation
 * survives, placement doesn't" cut Task 7 made for dust's own constants.
 */
export const DIG_SIGMA_MIN_PC = 100;
export const DIG_SIGMA_MAX_PC = 300;
/** Extraplanar DIG stands well above the disc a razor-thin HII shell sits in (Haffner+2009 review). */
export const DIG_SCALE_HEIGHT_PC = 300;
/** Ceiling on `fraction / (1 - fraction)` so a `dig.fraction` near 1 saturates the veil instead of diverging it. */
export const DIG_FLUX_RATIO_MAX = 4;
/**
 * Component-budget ceiling for the DIG veil, exported so a caller sizing a
 * fixed-capacity buffer (`createGalaxyModel.ts`'s `HII_MAX_COUNT +
 * DIG_MAX_COUNT`) has a worst case to reserve against: `dig.complexes` and
 * `dig.childrenPerComplex` are live-tunable, so their product needs a
 * ceiling the way `HII_MAX_COUNT`/`ARM_CLOUD_MAX_COUNT` ceiling their own
 * tiers. Sized to the UI's own slider ceilings (120 complexes x 12 children
 * = 1440), not derived from them, so a future slider-range change doesn't
 * silently resize a GPU buffer.
 */
export const DIG_MAX_COUNT = 1440;
/** A complex's child scatter before `dig.elongation` stretches/squeezes it — GMC-association scale, mirroring `dustParticleCloud.ts`'s own `COMPLEX_SPREAD_PC`; an eyeballed starting point, not a measurement. */
export const DIG_COMPLEX_SPREAD_PC = 250;

/** Complexes spawned per recent SF event: `dig.complexes` scales `recentEventCount` down to a diffuse haze's own population (a visual-calibration start, not a measurement). */
export const DIG_COMPLEXES_PER_EVENT = 0.12;
