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
fn solveKeplerFixed(meanAnomaly: f32, ecc: f32) -> f32 {
  let meanReduced = meanAnomaly - TAU * floor(meanAnomaly / TAU + 0.5);
  var eccAnomaly = meanReduced + 0.85 * ecc * sign(meanReduced);
  for (var iter = 0u; iter < KEPLER_STEPS; iter++) {
    let eSinE = ecc * sin(eccAnomaly);
    let eCosE = ecc * cos(eccAnomaly);
    let residual = eccAnomaly - eSinE - meanReduced;
    let slope = 1.0 - eCosE;
    let step = residual / (slope - residual * eSinE / (2.0 * slope));
    eccAnomaly = eccAnomaly - clamp(step, -KEPLER_MAX_STEP, KEPLER_MAX_STEP);
  }
  return eccAnomaly;
}
