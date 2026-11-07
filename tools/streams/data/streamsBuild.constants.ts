/**
 * Look and sampling constants of the stellar-streams build. Luminosity and size are display
 * quantities the renderer scales, not photometry; colour is a real B−V from the population model.
 */
import type { StreamPopulationAnchor } from '../@types/StreamPopulationAnchor';

/** Sagittarius particles drawn from the snapshot's 200,000 star particles. */
export const SGR_PARTICLE_BUDGET = 60_000;
/**
 * At most this share of the budget is still-bound remnant (`tStripGyr` 0): a uniform pick made it
 * 56%, ~33k particles in a few kpc that blew the core out to white. The rest goes to the debris.
 */
export const SGR_BOUND_SHARE = 0.1;
/**
 * Sagittarius [Fe/H] against stripping time, approximate, after Hayes et al. 2020, ApJ 889, 63
 * (arXiv:1912.06707) §4: the core's median −0.57 and the leading arm's −1.13, debris stripped
 * three pericentres (~2.7 Gyr) ago. A line between the two, flat beyond.
 */
export const SGR_FEH_BOUND = -0.57;
export const SGR_FEH_OLD = -1.13;
export const SGR_FEH_OLD_STRIP_GYR = 2.7;
export const SGR_LUMINOSITY = 1;
export const SGR_SIZE_KPC: readonly [number, number] = [0.25, 0.6];
export const SGR_SEED = 0x5347_5221n;
/**
 * Sagittarius's centrelines split the debris into arms by orbital energy in a logarithmic halo
 * of this circular speed, km/s: leading debris is more bound than the remnant, trailing less.
 */
export const SGR_ARM_SPLIT_V0_KMS = 220;
/** Each arm bins out to this percentile of its angle from the remnant; the sparse tail would bend the end. */
export const SGR_ARM_EXTENT_PERCENTILE = 95;
export const SGR_ARM_BINS = 16;
/** A bin with fewer particles averages noise, not the arm. */
export const SGR_ARM_BIN_MIN = 50;

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
/** End fade reaches full brightness 1/8 of the track in from each end. */
export const TRACK_END_FADE_SLOPE = 8;
export const TRACK_SEED = 0x4753_5452n;
/**
 * A pick centreline stays within the larger of half the stream's width and this share of its
 * length of the track: lean (~5 points for most streams) yet on the stream at any zoom.
 */
export const CENTRELINE_LENGTH_TOLERANCE = 0.01;

/**
 * A two-anchor approximation of an old population's light, linear in [Fe/H] between them and flat
 * outside: V-light share and light-weighted B−V per MIST v1.2 phase (vvcrit 0.4, log age 10.10,
 * Kroupa IMF; turnoff = main sequence, giants = RGB and AGB, BHB = core-helium burning).
 * −2.2 interpolates the −2.0 and −2.5 grids; at −0.5 the HB is red and counts as giants.
 */
export const STREAM_POPULATION_METAL_POOR: StreamPopulationAnchor = {
  feh: -2.2,
  bhbShare: 0.13,
  turnoffShare: 0.33,
  bhbBv: 0.15,
  turnoffBv: 0.51,
  giantBv: 0.78,
};
export const STREAM_POPULATION_METAL_RICH: StreamPopulationAnchor = {
  feh: -0.5,
  bhbShare: 0,
  turnoffShare: 0.36,
  bhbBv: 0.15,
  turnoffBv: 0.72,
  giantBv: 1.09,
};

/**
 * The Sun's velocity in the Galactic rest frame, km/s, galactic axes (astropy's Galactocentric
 * v4.0 default). Proper motions are heliocentric; a stream's own motion needs the reflex added.
 */
export const SUN_VELOCITY_GAL_KMS: readonly [number, number, number] = [12.9, 245.6, 7.78];
/** km/s per (kpc · mas/yr). */
export const KMS_PER_KPC_MASYR = 4.74047;
