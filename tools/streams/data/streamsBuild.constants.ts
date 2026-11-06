/**
 * Look and sampling constants of the stellar-streams build. Luminosity and size are display
 * quantities the renderer scales, not photometry; colour t runs 0 = blue to 1 = amber.
 */

/** Sagittarius particles drawn from the snapshot's 200,000 star particles. */
export const SGR_PARTICLE_BUDGET = 60_000;
/** The run's span (its trajectory starts at −3 Gyr), so the oldest debris (−2.6) never clamps. */
export const SGR_OLDEST_STRIP_GYR = 3;
export const SGR_LUMINOSITY = 1;
export const SGR_SIZE_KPC: readonly [number, number] = [0.25, 0.6];
