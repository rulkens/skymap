// lib/kepler.wesl — E from M = E − e·sin E in a fixed number of steps.
//
// Step for step the TS solveKeplerFixed (src/utils/orbit/solveKeplerFixed.ts), so the CPU mirror
// lands where the GPU does; change one, change both, and rerun its f32-emulation test. Danby's start
// E0 = M + 0.85·e·sign(M) keeps 5 Halley steps enough up to e = 0.99, and the |dE| <= 1 clamp stops
// an overshoot near e -> 1, M -> 0. floor(x + 0.5) is Math.round; WGSL's round() ties to even.

import package::lib::math::TAU;

const KEPLER_STEPS: u32 = 5u;
const KEPLER_MAX_STEP: f32 = 1.0;

// E on the branch of M reduced to [-pi, pi].
fn solveKeplerFixed(meanAnomaly: f32, e: f32) -> f32 {
  let m = meanAnomaly - TAU * floor(meanAnomaly / TAU + 0.5);
  var E = m + 0.85 * e * sign(m);
  for (var k = 0u; k < KEPLER_STEPS; k++) {
    let s = e * sin(E);
    let c = e * cos(E);
    let f = E - s - m;
    let df = 1.0 - c;
    let step = f / (df - f * s / (2.0 * df));
    E = E - clamp(step, -KEPLER_MAX_STEP, KEPLER_MAX_STEP);
  }
  return E;
}
