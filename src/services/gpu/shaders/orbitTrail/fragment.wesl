// orbitTrail/fragment.wesl — analytic screen-space conic stroke with a
// mean-anomaly trail falloff, for the additive HDR target (spec 3.3).
//
// The whole orbit is evaluated from ONE matrix, 'Ginv' (pixel -> orbital
// plane), reassembled from the three flat columns the vertex stage forwarded.
// The fragment reads its own framebuffer pixel and back-projects it into plane
// coordinates in a single matrix-vector product; every quantity below reads off
// that product.
//
// ## Why the fragment's f32 is safe (spec 3.3)
//
// 'pos' is O(1000) pixels and 'Ginv' maps it to O(1) plane coords, so 'q' and
// everything derived from it are well-conditioned — none of the tiny-Mpc
// cancellation that breaks the old unit-orbit-space SDF at deep zoom survives
// into pixel space. The back-projection feeds only the slowly-varying
// brightness, so even a sub-pixel f32 error in 'Ginv * pos' produces an
// invisible brightness error. That is precisely WHY the back-projection is
// allowed to be the one thing computed on the GPU.
//
// ## Why Sampson distance, not an ellipse-specific SDF
//
// The projected orbit is a GENERAL conic — an ellipse in the common case, but a
// parabola / hyperbola / line-pair as the orbit plane sweeps edge-on to the
// camera (spec 2). The Sampson distance 'abs(f) / length(grad f)' is the
// first-order geometric distance to the zero set of ANY quadratic, so it gives
// a constant-width pixel stroke uniformly across all those degeneracies without
// assuming ellipse-specific coefficients. It is already a pixel distance, so
// the stroke width is a fixed pixel constant — no 'fwidth' derivative needed.
//
// ## Why forward Kepler M = E - e*sin(E)
//
// The trail fades with MEAN anomaly so the tail tracks the body's real
// (equal-area) angular speed. Converting the pixel's eccentric anomaly E to
// mean anomaly is Kepler's equation in the FORWARD, closed-form direction —
// M = E - e*sin(E) — which needs no root-find on the GPU (the inverse M -> E
// would). 'meanAnomaly' (the body's M at the epoch) and 'eccentricity' are
// per-orbit constants.
//
// ## Output
//
// 'color * brightness * stroke' with alpha 1 for the one/one additive blend —
// the rgb IS the added light (the HDR convention every additive layer shares);
// alpha is ignored by the blend but kept at 1 for consistency.

import package::orbitTrail::io::VSOut;
import package::lib::math::PI;

// Stroke half-width in PIXELS — the Sampson distance is already measured in
// pixels, so this is a fixed screen constant at every zoom (spec 3.3).
const STROKE_PX: f32 = 1.5;
// Decay rate of the trail brightness per radian of mean anomaly behind the
// body. Larger values shrink the visible tail; 1.2 spans roughly a third of
// the orbit before bottoming out at TRAIL_FLOOR (carried from orbitRing).
const TRAIL_DECAY: f32 = 1.2;
// Brightness floor for the arc far behind / just ahead of the body. The whole
// orbit must stay clearly visible — the trail gradient is a direction cue
// layered ON TOP of an always-legible path, not a fade-to-black.
const TRAIL_FLOOR: f32 = 0.15;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Reassemble the pixel->plane inverse homography from its three columns.
  let ginv = mat3x3<f32>(in.ginv0, in.ginv1, in.ginv2);

  // Back-project the fragment's framebuffer pixel (in.clip.xy is the WGSL
  // '@builtin(position)' — origin top-left, y-down, pixel centres at +0.5,
  // the SAME convention composeOrbitConic's viewport matrix V was built for,
  // so it is consumed directly with no flip). q = (s/w, t/w, 1/w).
  let q = ginv * vec3<f32>(in.clip.xy, 1.0);

  // Behind-camera clip: q.z = 1/clip-w. The projective image of a conic
  // includes the arc BEHIND the camera, whose pixels have w < 0. Discard them.
  if (q.z <= 0.0) {
    discard;
  }

  // Plane coordinates and eccentric anomaly.
  let s = q.x / q.z;
  let t = q.y / q.z;
  let ecc = atan2(t, s); // eccentric anomaly E

  // Conic value f = q.x^2 + q.y^2 - q.z^2 (proportional to (s^2 + t^2 - 1)/w^2;
  // zero on the orbit, signed inside/outside). This is x^T * conic * x with the
  // pixel-space conic Ginv^T * diag(1,1,-1) * Ginv, but never assembled — it
  // reads straight off q.
  let f = q.x * q.x + q.y * q.y - q.z * q.z;

  // Sampson distance (constant-width pixel stroke). d = Ginv^T * (q.x, q.y,
  // -q.z) is half the pixel-space gradient of f; the geometric distance to the
  // zero set is abs(f) / length(grad f) = abs(f) / (2 * length(d.xy)). Guard
  // the degenerate zero-gradient point (conic centre) with a tiny epsilon so
  // the stroke never divides by zero.
  let d = transpose(ginv) * vec3<f32>(q.x, q.y, -q.z);
  let sampson = abs(f) / max(2.0 * length(d.xy), 1e-6);
  let stroke = 1.0 - smoothstep(0.0, STROKE_PX, sampson);

  // Trail recency via forward Kepler. delta is the mean-anomaly angle BEHIND
  // the body, wrapped into [0, 2*PI): floored-division modulo keeps it
  // non-negative even when meanAnomaly - m is negative.
  let m = ecc - in.eccentricity * sin(ecc);
  let raw = in.meanAnomaly - m;
  let twoPi = 2.0 * PI;
  let delta = raw - twoPi * floor(raw / twoPi);
  let brightness = TRAIL_FLOOR + (1.0 - TRAIL_FLOOR) * exp(-TRAIL_DECAY * delta);

  return vec4<f32>(in.color * brightness * stroke, 1.0);
}
