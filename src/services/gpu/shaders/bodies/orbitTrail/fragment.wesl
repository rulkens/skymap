// orbitTrail/fragment.wesl — analytic screen-space conic stroke with a
// mean-anomaly trail falloff, for the additive HDR target (spec 3.3). One
// matrix 'Ginv' (pixel -> orbital plane) back-projects the fragment's own
// pixel; every quantity below reads off that one product. Full derivations
// (Sampson vs plane-space distance, dpdx/dpdy vs analytic gradient, forward
// Kepler, f32 safety, discard-vs-zero) live in
// docs/references/orbit-trail-fragment-math.md.

import package::bodies::orbitTrail::constants::STROKE_PX;
import package::bodies::orbitTrail::io::VSOut;
import package::lib::math::TAU;
import package::lib::trailOcclusion::trailClearance;

// TRAIL_FLOOR keeps the far arc legible instead of fading to black.
const TRAIL_DECAY: f32 = 1.2;
const TRAIL_FLOOR: f32 = 0.3;
// Newton-consistency tolerance for the horizon rejection below.
const REFINE_TOL: f32 = 0.25;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let ginv = mat3x3<f32>(in.ginv0, in.ginv1, in.ginv2);
  // '@builtin(position)': top-left origin, y-down — composeOrbitConic's viewport convention.
  let planePoint = ginv * vec3<f32>(in.clip.xy, 1.0);

  // planePoint.z = 1/clip-w; the conic's projective image includes the behind-camera arc (w < 0).
  if (planePoint.z <= 0.0) {
    discard;
  }

  // atan2 is scale-invariant, so 'ecc' needs no divide; only 'conicRadius' below does (doc: f32 safety).
  let planeXy = planePoint.xy;
  let projectiveWeight = planePoint.z;
  let planeXyLength = length(planeXy);
  let ecc = atan2(planeXy.y, planeXy.x); // eccentric anomaly E

  // Gradient measured with dpdx/dpdy, not derived analytically (doc: why the gradient...).
  // Do NOT reintroduce Dekker/TwoSum here: this toolchain's fast-math breaks it, hardware-verified.
  let conicRadius = planeXyLength / projectiveWeight;
  let gradPx = vec2<f32>(dpdx(conicRadius), dpdy(conicRadius));
  let dist = abs(conicRadius - 1.0) / max(length(gradPx), 1e-30);

  // NaN fails closed: '!(dist < STROKE_PX)' is also true for NaN, so a degenerate Ginv discards.
  if (!(dist < STROKE_PX)) {
    discard;
  }

  // Horizon rejection: 'dist' is first-order and collapses near the horizon; verify by stepping.
  let gradDir = gradPx / max(length(gradPx), 1e-30);
  let steppedPx = in.clip.xy - sign(conicRadius - 1.0) * dist * gradDir;
  let steppedPlanePoint = ginv * vec3<f32>(steppedPx, 1.0);
  let steppedConicRadius = length(steppedPlanePoint.xy / steppedPlanePoint.z);
  // Keep-form: a NaN comparison is always false, so requiring KEEP true (not reject-form) routes a non-finite steppedConicRadius into this discard too.
  if (!(steppedPlanePoint.z > 0.0 && abs(steppedConicRadius - 1.0) < REFINE_TOL)) {
    discard;
  }

  let stroke = 1.0 - smoothstep(0.0, STROKE_PX, dist);

  // The orbit point behind this fragment, eye-relative: hidden where a resolved
  // body sits on the segment back to the eye, so a body's own trail stops at its limb.
  let orbitPointRelEye = in.occCentre + (planeXy.x / projectiveWeight) * in.occMajor + (planeXy.y / projectiveWeight) * in.occMinor;
  let clear = trailClearance(orbitPointRelEye, in.clip.xy);

  if (clear <= 0.0) {
    discard;
  }

  // Forward Kepler M = E - e*sin(E): closed-form, no GPU root-find (doc: why forward Kepler).
  let fragMeanAnomaly = ecc - in.eccentricity * sin(ecc);
  let raw = in.meanAnomaly - fragMeanAnomaly;
  let delta = raw - TAU * floor(raw / TAU);
  let brightness = TRAIL_FLOOR + (1.0 - TRAIL_FLOOR) * exp(-TRAIL_DECAY * delta);

  // 'in.alpha': per-orbit apparent-size fade, ramping to 0 as the orbit nears the cull threshold.
  return vec4<f32>(in.color * brightness * stroke * clear * in.alpha, 1.0);
}

// Debug lens (debug.overlays['orbit-trail-impostor']): fills the impostor with the orbit's own colour, ignoring fade alpha so a faded-but-drawn orbit still shows its hull.
@fragment
fn fsImpostorRibbon(in: VSOut) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color * 0.2, 1.0); // dimmed so overlapping hulls read as layers
}
