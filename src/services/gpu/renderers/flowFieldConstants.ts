/**
 * Flow-field tunables — the single source of truth for the constants the flow
 * shaders and the TS renderer / store share.
 *
 * These are the look and the buffer geometry, so they are NOT to be "tidied":
 * TRAIL sets the ring length AND the vertex count of every ribbon (draw is
 * 2*TRAIL vertices), LIFE/FADE shape the advect alpha envelope, MAX_PARTICLES
 * sizes the storage buffers AND is the particle-slider ceiling, and
 * HEAD_STEP_SCALE / SPEED_COLOR_MAX / DENS_SCALE map slider values into the
 * integrator and the colour ramp.
 *
 * Ported from the standalone spike's
 * `tools/cosmic-flow/src/visualizations/flowField/constants.ts` with one
 * spec-pinned change: MAX_PARTICLES drops from the spike's 100000 to 40000. The
 * rationale is that the buffer capacity, the particle-slider ceiling, and the
 * default count are one and the same number — so the runtime sizes its storage
 * buffers to exactly the slider's top end rather than over-allocating for a
 * ceiling the UI never exposes.
 *
 * The shader-side subset (TRAIL, LIFE, FADE, DENS_SCALE, SPEED_COLOR_MAX) is
 * mirrored as plain WESL consts in `../shaders/flow/flowConstants.wesl`; this
 * module stays authoritative and a parity test
 * (`tests/services/gpu/shaders/flowConstants.parity.test.ts`) reads that `.wesl`
 * file and asserts each value matches the export of the same name, so the two
 * cannot drift — `?static` WESL linking is pure build-time linking with NO
 * value injection. DT / MAX_PARTICLES / HEAD_STEP_SCALE are TS-only (buffer
 * sizing + uniform values), so they have no WESL mirror.
 */

export const TRAIL = 32; // ring length per particle — pathline / streamline points
export const MAX_PARTICLES = 40000; // buffer capacity = slider ceiling = default count
export const LIFE = 8.0; // advect particle lifetime, frame-time units, then it recycles
export const FADE = 1.4; // advect alpha fade-in/out window, age units
export const DT = 0.016; // fixed integration timestep handed to the compute pass
export const HEAD_STEP_SCALE = 0.012; // flowSpeed -> advect head distance per frame (motion speed)
export const SPEED_COLOR_MAX = 1200.0; // km/s mapped to the hot end of the speed colour ramp
export const DENS_SCALE = 1.0; // overdensity delta -> spawn weight (clamped 0..1); seeding selectivity
