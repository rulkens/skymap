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
export const SGR_SEED = 0x5347_5221n;

export const TRACK_LUMINOSITY = 0.8;
/** Particles per kpc of track at the reference width; wider streams get proportionally more. */
export const TRACK_PARTICLES_PER_KPC = 60;
export const TRACK_PARTICLES_MIN = 300;
export const TRACK_PARTICLES_MAX = 30_000;
export const TRACK_REFERENCE_WIDTH_KPC = 0.3;
/** Used when the master log has no `width_phi2` (−9, −1: "from members", never filled in). */
export const TRACK_DEFAULT_WIDTH_DEG = 0.3;
export const TRACK_MIN_WIDTH_KPC = 0.03;
export const TRACK_SIZE_PER_WIDTH = 0.8;
export const TRACK_SIZE_KPC: readonly [number, number] = [0.05, 0.3];
export const TRACK_COLOUR_T_MAX = 0.6;
/** End fade reaches full brightness 1/8 of the track in from each end. */
export const TRACK_END_FADE_SLOPE = 8;
export const TRACK_SEED = 0x4753_5452n;

/**
 * The Sun's velocity in the Galactic rest frame, km/s, galactic axes (astropy's Galactocentric
 * v4.0 default). Proper motions are heliocentric; a stream's own motion needs the reflex added.
 */
export const SUN_VELOCITY_GAL_KMS: readonly [number, number, number] = [12.9, 245.6, 7.78];
/** km/s per (kpc · mas/yr). */
export const KMS_PER_KPC_MASYR = 4.74047;
