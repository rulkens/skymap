// flowConstants.wesl — the shader-side mirror of the shared flow-field tunables.
//
// Sister to 'src/visualizations/flowField/constants.ts', which is the
// AUTHORITATIVE source of truth (it also sizes the TS-side buffer geometry).
// This module re-declares only the subset both flow shaders read, as plain WESL
// consts the linker can inline. The 'flowField/shaders/flowConstants' parity
// test reads this file as text, regex-extracts each 'const NAME: type = value;'
// line, and asserts numerical equality with the TS export of the same name — so
// the two cannot drift. Mirrors the runtime's 'lib/selectionEncoding.wesl'
// pattern (WESL const mirror + parity test, no value injection).
//
// flow.compute imports TRAIL, LIFE, DENS_SCALE; flow.render imports TRAIL, LIFE,
// FADE, SPEED_COLOR_MAX. The linker tree-shakes whatever a given entry omits.

const TRAIL: u32 = 32u;            // ring length per particle — pathline / streamline points
const LIFE: f32 = 8.0;             // advect particle lifetime, frame-time units, then it recycles
const FADE: f32 = 1.4;             // advect alpha fade-in/out window, age units
const DENS_SCALE: f32 = 1.0;       // overdensity delta -> spawn weight (clamped 0..1)
const SPEED_COLOR_MAX: f32 = 1200.0;  // km/s mapped to the hot end of the speed colour ramp
