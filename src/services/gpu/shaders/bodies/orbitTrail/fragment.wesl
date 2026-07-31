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
// ## Why the plane-space distance, not the algebraic conic value (Sampson)
//
// The projected orbit is a GENERAL conic, and at Earth-surface zoom the camera
// sits essentially ON its own orbit (camera-to-Earth is ~1e-4 of the orbit
// radius), so the conic passes through the eye point — the maximally edge-on
// pose, which is the PRIMARY viewing condition here, not an edge case. The
// first-order Sampson distance 'abs(f) / length(grad f)' linearises the
// algebraic conic 'f = q.x^2 + q.y^2 - q.z^2', whose gradient magnitude and
// curvature swing violently where the projected conic turns sharply; its
// constant-width band then fans out into rays around that turn (the flare).
//
// Instead we measure distance in PLANE space, where the orbit is simply the
// unit circle 's^2 + t^2 = 1'. There 'r - 1' (with 'r = length(vec2(s, t))') is
// the EXACT Euclidean distance to the orbit — a true distance function, with no
// algebraic-curvature term to blow up. Dividing by the pixel gradient of 'r'
// (chain rule through q = Ginv * pixel, s = q.x/q.z, t = q.y/q.z) converts it to
// a constant screen-space pixel width. At well-conditioned poses this equals
// Sampson to the pixel; at the edge-on pose it stays a thin line where Sampson
// flared (verified numerically over the earth / jupiter / moon conics).
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
//
// ## Why the off-stroke discard (NOT a zero write)
//
// The fullscreen triangle covers the whole viewport, so EVERY pixel runs this
// fragment. Writing 0 off the stroke would be transparent under additive
// blend — fine in the well-conditioned case. But at a near-degenerate pose the
// inverse homography 'Ginv' can carry non-finite entries, and then 'q' and
// 'dist' are NaN across the triangle's whole in-front-of-camera region; an
// additive NaN write paints a solid black ellipse (bounded by the q.z=0 curve).
// Guarding with '!(dist < STROKE_PX)' — which is TRUE for NaN — DISCARDS both
// the off-stroke pixels and any non-finite one, so the triangle can only ever
// deposit light on the ring itself, never a filled blob.

import package::bodies::orbitTrail::constants::STROKE_PX;
import package::bodies::orbitTrail::io::VSOut;
import package::lib::math::PI;

// Decay rate of the trail brightness per radian of mean anomaly behind the
// body. Larger values shrink the visible tail; 1.2 spans roughly a third of
// the orbit before bottoming out at TRAIL_FLOOR.
const TRAIL_DECAY: f32 = 1.2;
// Brightness floor for the arc far behind / just ahead of the body. The whole
// orbit must stay clearly visible — the trail gradient is a direction cue
// layered ON TOP of an always-legible path, not a fade-to-black.
const TRAIL_FLOOR: f32 = 0.3;
// Newton-consistency tolerance for the horizon rejection (see the fragment
// body). A pixel is genuine only if one refinement step lands within this of
// the unit circle (r = 1); horizon pixels stay far outside it.
const REFINE_TOL: f32 = 0.25;

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

  // Distance to the orbit, measured in PLANE space (the orbit is the unit
  // circle s^2 + t^2 = 1) then converted to a constant pixel width. 'r - 1' is
  // the EXACT Euclidean distance to the orbit in plane coords — no algebraic-
  // curvature term to flare where the projected conic turns (see header).
  let r = length(vec2<f32>(s, t));

  // Pixel gradients of s = q.x/q.z and t = q.y/q.z via the quotient rule.
  // Written the obvious way, each numerator is a difference of two products
  // (e.g. ginv[0].x * q.z - q.x * ginv[0].z). Expand q = ginv * (px, py, 1) and
  // the top-degree px (resp. py) terms cancel IDENTICALLY, leaving a numerator
  // that is AFFINE in the pixel with a 2x2-minor coefficient. At the near-edge-
  // on Earth-zoom pose the plane-to-pixel homography is ILL-CONDITIONED (its
  // condition number reaches ~1e15), so the two products are nearly equal and
  // that f32 difference cancels catastrophically -- the tiny true result keeps
  // almost none of f32's significant digits. The loss is set by the condition
  // number, NOT the entry magnitudes: rescaling ginv to O(1) (which
  // composeOrbitConic does) does not help, so the garbage residual, amplified by
  // invZ2, is what speckled Earth's orbit fill. So composeOrbitConic hoists the
  // exactly-cancelling numerators to CPU
  // f64 as the minors minorS = (M1, M2, M3) and minorT = (M4, M5, M6), and the
  // fragment just evaluates the affine forms (a multiply-add, no cancellation):
  //   d s/d px numerator = M1*py + M2,   d s/d py numerator = -M1*px + M3
  //   d t/d px numerator = M4*py + M5,   d t/d py numerator = -M4*px + M6
  // The pixel is in.clip.xy (the same @builtin(position) that formed q above);
  // q.z > 0 here (the behind-camera arc was already discarded).
  let px = in.clip.x;
  let py = in.clip.y;
  let invZ2 = 1.0 / (q.z * q.z);
  let dsdp = vec2<f32>(
    in.minorS.x * py + in.minorS.y,
    -in.minorS.x * px + in.minorS.z,
  ) * invZ2;
  let dtdp = vec2<f32>(
    in.minorT.x * py + in.minorT.y,
    -in.minorT.x * px + in.minorT.z,
  ) * invZ2;
  // grad_pixel r = (s * grad s + t * grad t) / r; the pixel distance to the
  // orbit is abs(r - 1) / |grad_pixel r|. Guard the conic centre (r -> 0) and
  // the zero-gradient point with tiny epsilons so the stroke never divides by
  // zero.
  let gradR = (s * dsdp + t * dtdp) / max(r, 1e-20);
  let dist = abs(r - 1.0) / max(length(gradR), 1e-20);

  // Off-stroke discard. '!(dist < STROKE_PX)' is true when the pixel is beyond
  // the stroke AND when 'dist' is NaN (a NaN comparison is false), so both the
  // empty interior and any non-finite pixel from a degenerate 'Ginv' write
  // nothing — the triangle can only light the ring, never a filled blob.
  if (!(dist < STROKE_PX)) {
    discard;
  }

  // Horizon rejection via a Newton-consistency check. 'dist' is a FIRST-ORDER
  // estimate; near the orbit plane's line at infinity (a pixel approaching
  // q.z=0) it wrongly collapses to ~0 and would paint a spurious thin line along
  // the horizon in the orbit's colour — most visible at grazing angles, where
  // the horizon merges continuously with the real orbit so no simple r cutoff
  // separates them. So VERIFY the estimate: step 'dist' pixels toward the orbit
  // along -sign(r-1)*n̂ and recompute r. A genuine near-orbit pixel lands on
  // r≈1; a horizon pixel (where r varies nonlinearly) stays far from 1 — or the
  // step lands behind the camera — and is discarded.
  let n = gradR / max(length(gradR), 1e-20);
  let pStep = in.clip.xy - sign(r - 1.0) * dist * n;
  let qStep = ginv * vec3<f32>(pStep, 1.0);
  let rStep = length(qStep.xy / qStep.z);
  if (qStep.z <= 0.0 || abs(rStep - 1.0) >= REFINE_TOL) {
    discard;
  }

  let stroke = 1.0 - smoothstep(0.0, STROKE_PX, dist);

  // Trail recency via forward Kepler. delta is the mean-anomaly angle BEHIND
  // the body, wrapped into [0, 2*PI): floored-division modulo keeps it
  // non-negative even when meanAnomaly - m is negative.
  let m = ecc - in.eccentricity * sin(ecc);
  let raw = in.meanAnomaly - m;
  let twoPi = 2.0 * PI;
  let delta = raw - twoPi * floor(raw / twoPi);
  let brightness = TRAIL_FLOOR + (1.0 - TRAIL_FLOOR) * exp(-TRAIL_DECAY * delta);

  // 'in.alpha' is the per-orbit apparent-size fade (CPU-side): full for orbits
  // comfortably above the cull threshold, ramping to 0 as they shrink toward it.
  return vec4<f32>(in.color * brightness * stroke * in.alpha, 1.0);
}

// Debug lens ('debug.showOrbitTrailImpostor'): constant-colour passes that
// make the impostor geometry itself visible, drawn IN ADDITION to 'fs' by the
// renderer's debug pipelines. 'fsImpostorRibbon' fills the ribbon hull so a gap
// in its coverage of the stroke shows as a broken arc; 'fsImpostorFallback'
// marks an orbit that took the fullscreen path — a silent perf cost, not a
// visual one.

@fragment
fn fsImpostorRibbon(in: VSOut) -> @location(0) vec4<f32> {
  return vec4<f32>(0.9, 0.15, 0.9, 1.0); // hull fill: magenta
}

// A sparse diagonal hatch, NOT a full-viewport wash: the fallback path is the
// common case at solar-system scales (the camera sits inside every orbit), so
// one opaque fill per fallback instance stacks additively and buries the scene.
// The hatch keys off the pixel coordinate alone because the viewport size is
// not a varying, and it leaves ~95 percent of pixels untouched however many
// instances draw.
@fragment
fn fsImpostorFallback(in: VSOut) -> @location(0) vec4<f32> {
  let stripe = (in.clip.x + in.clip.y) % 64.0;
  if (stripe >= 2.0) {
    discard;
  }
  return vec4<f32>(0.25, 0.16, 0.0, 1.0); // fallback hatch: amber
}
