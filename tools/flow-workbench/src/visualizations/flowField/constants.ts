/**
 * Flow-field tunables — the single source of truth for the constants the shaders
 * and the TS visualization share.
 *
 * These are the look and the buffer geometry, so they are
 * NOT to be "tidied": TRAIL sets the ring length AND the vertex count of every
 * ribbon (draw is 2*TRAIL vertices), LIFE/FADE shape the advect alpha envelope,
 * MAX_PARTICLES sizes the storage buffers, and HEAD_STEP_SCALE / SPEED_COLOR_MAX
 * / DENS_SCALE map slider values into the integrator and the colour ramp.
 *
 * The shader-side subset (TRAIL, LIFE, FADE, DENS_SCALE, SPEED_COLOR_MAX) is
 * mirrored as plain WESL consts in `shaders/flowConstants.wesl`; this module
 * stays authoritative and a parity test
 * (`tests/tools/cosmic-flow/visualizations/flowConstants.parity.test.ts`) reads
 * that `.wesl` file and asserts each value matches the export of the same name,
 * so the two cannot drift. DT / MAX_PARTICLES / HEAD_STEP_SCALE are TS-only
 * (buffer sizing + uniform values), so they have no WESL mirror.
 */

export const TRAIL = 32; // ring length per particle — pathline / streamline points
export const LIFE = 8.0; // advect particle lifetime, frame-time units, then it recycles
export const FADE = 1.4; // advect alpha fade-in/out window, age units
export const DT = 0.016; // fixed integration timestep handed to the compute pass
export const MAX_PARTICLES = 100000; // buffer capacity; the particle slider draws a subset
export const HEAD_STEP_SCALE = 0.012; // flowSpeed -> advect head distance per frame (motion speed)
export const SPEED_COLOR_MAX = 1200.0; // km/s mapped to the hot end of the speed colour ramp
export const DENS_SCALE = 1.0; // overdensity delta -> spawn weight (clamped 0..1); seeding selectivity
