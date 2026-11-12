// asteroids/lib/apparentMagnitude.wesl — V from the H,G system, step for step the TS
// asteroidApparentMagnitude (src/utils/photometry/), so the dot and the card agree.
//
// The HG_* constants mirror HG_PHASE_LAW (src/data/asteroids/hgPhaseLaw.ts), pinned by
// tests/services/gpu/shaders/hgPhaseLaw.parity.test.ts. The flux the dot deposits is
// pow(10, -0.4 * V), the stars' fluxApp convention, fed to starPeakIntensity. WGSL has no log10.

import package::lib::math::LOG10;

const HG_A1: f32 = 3.33;
const HG_A2: f32 = 1.87;
const HG_B1: f32 = 0.63;
const HG_B2: f32 = 1.22;
// alpha = 180 deg divides by zero; pow(0, y) is undefined in WGSL; G > 1 can make the phase sum
// negative at large alpha.
const HG_COS_PHASE_MIN: f32 = -0.9999;
const HG_HALF_TAN_FLOOR: f32 = 1e-12;
const HG_PHASE_SUM_FLOOR: f32 = 1e-30;

// r and delta in AU; cosPhase = dot(sun->ast, cam->ast) / (r * delta).
fn asteroidApparentMagnitude(h: f32, g: f32, rAu: f32, deltaAu: f32, cosPhase: f32) -> f32 {
  let c = clamp(cosPhase, HG_COS_PHASE_MIN, 1.0);
  let halfTan = max(HG_HALF_TAN_FLOOR, sqrt((1.0 - c) / (1.0 + c)));
  let phi1 = exp(-HG_A1 * pow(halfTan, HG_B1));
  let phi2 = exp(-HG_A2 * pow(halfTan, HG_B2));
  let phase = max(HG_PHASE_SUM_FLOOR, (1.0 - g) * phi1 + g * phi2);
  return h + (5.0 * log(rAu * deltaAu) - 2.5 * log(phase)) / LOG10;
}
