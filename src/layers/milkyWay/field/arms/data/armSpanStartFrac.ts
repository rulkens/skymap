/**
 * Where an ordinary arm starts placing, as a fraction of `armStartRadius` —
 * `describeGalaxy` stores `log` of this as every non-spur arm's own
 * `GalaxyFieldArmRecord.spanStartLogR` (a spur's is its own root, further
 * out — `buildArmSpurs.ts`). This constant's one remaining direct
 * consumer is `clusteredDiscPlacement.ts`'s arm-lane seeding, which only
 * ever runs over `geometry.arms`, never spurs.
 */
export const ARM_SPAN_START_FRAC = 1.05;
