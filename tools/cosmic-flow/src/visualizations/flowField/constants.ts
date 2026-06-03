/**
 * Flow-field tunables — the single source of truth for the constants the WGSL
 * modules and the TS visualization share.
 *
 * These are the look and the buffer geometry, so they are
 * NOT to be "tidied": TRAIL sets the ring length AND the vertex count of every
 * ribbon (draw is 2*TRAIL vertices), LIFE/FADE shape the advect alpha envelope,
 * MAX_PARTICLES sizes the storage buffers, and HEAD_STEP_SCALE / SPEED_COLOR_MAX
 * / DENS_SCALE map slider values into the integrator and the colour ramp.
 *
 * The WGSL modules inject these via `${...}` string interpolation; floats must
 * be emitted as WGSL float literals (e.g. 8 -> '8.0', never bare '8' which WGSL
 * would read as an i32). `wgslF` does exactly that — integers get a '.0'
 * suffix, non-integers print as-is.
 */

export const TRAIL = 32; // ring length per particle — pathline / streamline points
export const LIFE = 8.0; // advect particle lifetime, frame-time units, then it recycles
export const FADE = 1.4; // advect alpha fade-in/out window, age units
export const DT = 0.016; // fixed integration timestep handed to the compute pass
export const MAX_PARTICLES = 100000; // buffer capacity; the particle slider draws a subset
export const HEAD_STEP_SCALE = 0.012; // flowSpeed -> advect head distance per frame (motion speed)
export const SPEED_COLOR_MAX = 1200.0; // km/s mapped to the hot end of the speed colour ramp
export const DENS_SCALE = 1.0; // overdensity delta -> spawn weight (clamped 0..1); seeding selectivity

/** Emit a WGSL float literal: integers gain a '.0' suffix, others print as-is. */
export const wgslF = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));
