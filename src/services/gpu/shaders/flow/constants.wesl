// flow/constants.wesl — the shader-side mirror of the shared flow-field tunables.
//
// Hand-written mirror of the subset both flow passes read from the
// AUTHORITATIVE TS source of truth, 'src/data/flowFieldConstants.ts'
// (which also sizes the TS-side buffer geometry). This module re-declares only
// that subset as plain WESL consts the linker can inline. The
// 'tests/services/gpu/shaders/constants.parity.test.ts' parity test reads
// this file as text, regex-extracts each 'const NAME: type = value;' line, and
// asserts numerical equality with the TS export of the same name — so the two
// cannot drift, because '?static' WESL linking does build-time linking with NO
// value injection. Mirrors the runtime's 'lib/selectionEncoding.wesl' pattern.

const TRAIL: u32 = 32u;            // ring length per particle — pathline / streamline points
const LIFE: f32 = 8.0;             // advect particle lifetime, seconds, then it recycles
const FADE: f32 = 1.4;             // advect alpha fade-in/out window, seconds of age
const DENS_SCALE: f32 = 1.0;       // overdensity delta -> spawn weight (clamped 0..1)
const SPEED_COLOR_MAX: f32 = 1200.0;  // km/s mapped to the hot end of the speed colour ramp
