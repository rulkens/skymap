// orbitTrail/fragment.wesl — analytic screen-space conic stroke with a
// mean-anomaly trail falloff, for the additive HDR target (spec 3.3). One
// matrix 'Ginv' (pixel -> orbital plane) back-projects the fragment's own
// pixel; every quantity below reads off that one product. Full derivations
// (Sampson vs plane-space distance, dpdx/dpdy vs analytic gradient, forward
// Kepler, f32 safety, discard-vs-zero) live in
// docs/references/orbit-trail-fragment-math.md.

import package::bodies::orbitTrail::constants::MAX_OCCLUDERS;
import package::bodies::orbitTrail::constants::STROKE_PX;
import package::bodies::orbitTrail::io::VSOut;
import package::lib::math::TAU;

// The frame's opaque bodies as eye-relative spheres (centre.xyz, radius.w, km),
// 'count' live entries — orbitTrailRenderer.ts mirrors this layout, pinned by
// orbitTrailConstants.parity.test.ts.
struct OcclusionUniforms {
  count: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
  spheres: array<vec4<f32>, MAX_OCCLUDERS>,
};

@group(0) @binding(0) var<uniform> occ: OcclusionUniforms;

// TRAIL_FLOOR keeps the far arc legible instead of fading to black.
const TRAIL_DECAY: f32 = 1.2;
const TRAIL_FLOOR: f32 = 0.3;
// Newton-consistency tolerance for the horizon rejection below.
const REFINE_TOL: f32 = 0.25;

// Visibility of the eye->x SEGMENT (eye at the origin) past one sphere
// (centre.xyz, radius.w, km): 0 inside it, 1 clear of it, one-pixel limb ramp.
// The [0,1] clamp is what keeps a near arc visible (doc: why occlusion is a segment test).
fn sphereClearance(x: vec3<f32>, sphere: vec4<f32>) -> f32 {
  let c = sphere.xyz;
  let along = clamp(dot(c, x) / max(dot(x, x), 1e-30), 0.0, 1.0);
  let gap = length(along * x - c) - sphere.w;
  let aa = max(fwidth(gap), 1e-6);
  return smoothstep(-aa, aa, gap);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let ginv = mat3x3<f32>(in.ginv0, in.ginv1, in.ginv2);
  // '@builtin(position)': top-left origin, y-down — composeOrbitConic's viewport convention.
  let q = ginv * vec3<f32>(in.clip.xy, 1.0);

  // q.z = 1/clip-w; the conic's projective image includes the behind-camera arc (w < 0).
  if (q.z <= 0.0) {
    discard;
  }

  // atan2 is scale-invariant, so 'ecc' needs no divide; only 'r' below does (doc: f32 safety).
  let u = q.xy;
  let z = q.z;
  let uLen = length(u);
  let ecc = atan2(u.y, u.x); // eccentric anomaly E

  // Gradient measured with dpdx/dpdy, not derived analytically (doc: why the gradient...).
  // Do NOT reintroduce Dekker/TwoSum here: this toolchain's fast-math breaks it, hardware-verified.
  let r = uLen / z;
  let gradPx = vec2<f32>(dpdx(r), dpdy(r));
  let dist = abs(r - 1.0) / max(length(gradPx), 1e-30);

  // NaN fails closed: '!(dist < STROKE_PX)' is also true for NaN, so a degenerate Ginv discards.
  if (!(dist < STROKE_PX)) {
    discard;
  }

  // Horizon rejection: 'dist' is first-order and collapses near the horizon; verify by stepping.
  let n = gradPx / max(length(gradPx), 1e-30);
  let pStep = in.clip.xy - sign(r - 1.0) * dist * n;
  let qStep = ginv * vec3<f32>(pStep, 1.0);
  let rStep = length(qStep.xy / qStep.z);
  // Keep-form: a NaN comparison is always false, so requiring KEEP true (not reject-form) routes a non-finite rStep into this discard too.
  if (!(qStep.z > 0.0 && abs(rStep - 1.0) < REFINE_TOL)) {
    discard;
  }

  let stroke = 1.0 - smoothstep(0.0, STROKE_PX, dist);

  // The orbit point behind this fragment, eye-relative: hidden where a resolved
  // body sits on the segment back to the eye, so a body's own trail stops at its limb.
  let x = in.occCentre + (u.x / z) * in.occMajor + (u.y / z) * in.occMinor;
  var clear = 1.0;
  for (var i = 0u; i < occ.count; i++) {
    clear *= sphereClearance(x, occ.spheres[i]);
  }
  if (clear <= 0.0) {
    discard;
  }

  // Forward Kepler M = E - e*sin(E): closed-form, no GPU root-find (doc: why forward Kepler).
  let m = ecc - in.eccentricity * sin(ecc);
  let raw = in.meanAnomaly - m;
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
