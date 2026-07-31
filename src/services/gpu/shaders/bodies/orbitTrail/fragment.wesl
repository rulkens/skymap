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

import package::bodies::orbitTrail::constants::SEGMENTS;
import package::bodies::orbitTrail::constants::STROKE_PX;
import package::bodies::orbitTrail::io::VSOut;
import package::lib::math::TAU;

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

  // Plane coordinates, kept as u = q.xy (ginv is rescaled to max entry 1, so
  // u and z stay pixel-scale, ~1e4) instead of dividing down to s = u.x/z,
  // t = u.y/z: at the near-fold regime (clip w -> 0) z collapses toward 0 and
  // s, t, and their products overflow f32; u and z alone do not.
  let u = q.xy;
  let z = q.z;
  let uLen = length(u);

  // atan2 is scale-invariant: atan2(u.y, u.x) equals atan2(t, s), no divide needed.
  let ecc = atan2(u.y, u.x); // eccentric anomaly E

  // E-ownership discard for fold-widened (over-wide) quads: [eLo, eHi) is
  // half-open and bit-identical across segments (both sides compute
  // TAU*i/SEGMENTS from the same integer i), so exactly one tested quad ever
  // owns a given pixel's E, however much widened quads overlap on screen —
  // no double-add under additive blend, no gap. Untested quads skip this
  // entirely: their footprint (the abutting invariant) IS their ownership.
  // The window span is the shared TAU/SEGMENTS, not eHi - eLo: the last
  // segment's eHi (TAU*96/96) can round a sub-ulp shy of TAU, leaving a seam.
  if (in.eOwn.z > 0.5) {
    let dE = ecc - in.eOwn.x;
    let dEw = dE - TAU * floor(dE / TAU);
    if (dEw >= TAU / f32(SEGMENTS)) {
      discard;
    }
  }

  // Pixel gradients of s = q.x/q.z, t = q.y/q.z via the quotient rule. Each
  // numerator (e.g. ginv[0].x*q.z - q.x*ginv[0].z, with q = ginv*(px,py,1))
  // has its top-degree px/py terms cancel IDENTICALLY, leaving one AFFINE in
  // the pixel with a 2x2-minor coefficient. At the near-edge-on Earth-zoom
  // pose the homography is ILL-CONDITIONED (~1e15), so computing that
  // difference directly in f32 cancels catastrophically — rescaling ginv
  // doesn't help, since the loss is set by the condition number, not the
  // entry magnitudes. So composeOrbitConic hoists the exactly-cancelling
  // numerators to CPU f64 as minorS = (M1, M2, M3), minorT = (M4, M5, M6):
  //   d s/d px numerator = M1*py + M2,   d s/d py numerator = -M1*px + M3
  //   d t/d px numerator = M4*py + M5,   d t/d py numerator = -M4*px + M6
  // The pixel is in.clip.xy; z > 0 here (behind-camera arc already discarded).
  let px = in.clip.x;
  let py = in.clip.y;

  // gradR = (s*dsdp + t*dtdp)/r where dsdp = A_s/z^2, dtdp = A_t/z^2 (A_s,
  // A_t the affine numerators above) and r = uLen/z. Substituting s = u.x/z,
  // t = u.y/z collapses every explicit 1/z power into one shared factor:
  //   gradR = (u.x*A_s + u.y*A_t) / (z^2 * uLen) = gradNum / (z^2 * uLen)
  // gradNum below IS that numerator: with ginv entries <= 1 and u, z ~1e4, it
  // reaches ~1e8 — far under f32's 3.4e38 ceiling, the load-bearing bound.
  let gradNum = vec2<f32>(
    u.x * (in.minorS.x * py + in.minorS.y) + u.y * (in.minorT.x * py + in.minorT.y),
    u.x * (-in.minorS.x * px + in.minorS.z) + u.y * (-in.minorT.x * px + in.minorT.z),
  );

  // Distance to the orbit: the same real value as |r-1|/|gradR|, but with the
  // shared z^2*uLen factor multiplied through instead of divided out — its
  // largest intermediate (z^2*uLen*|uLen-z|) reaches ~1e13, still far under
  // f32's ceiling, unlike the old divided-out form that overflowed near the fold:
  //   |r-1|/|gradR| = (|uLen-z|/z) * (z^2*uLen)/|gradNum| = |uLen-z|*z*uLen/|gradNum|
  let dist = abs(uLen - z) * z * uLen / max(length(gradNum), 1e-30);

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
  // along -sign(uLen-z)*n̂ (same sign as -sign(r-1), since z > 0) and recompute
  // r. A genuine near-orbit pixel lands on r≈1; a horizon pixel (where r varies
  // nonlinearly) stays far from 1 — or the step lands behind the camera.
  let n = gradNum / max(length(gradNum), 1e-30);
  let pStep = in.clip.xy - sign(uLen - z) * dist * n;
  let qStep = ginv * vec3<f32>(pStep, 1.0);
  let rStep = length(qStep.xy / qStep.z);
  // Keep-form, not reject-form: a NaN comparison is always false, so the old
  // reject test 'abs(rStep - 1.0) >= REFINE_TOL' let a non-finite rStep (the
  // near-fold overflow case) fall through the discard and PAINT at full
  // brightness. Requiring the KEEP condition true instead means every
  // non-finite path takes the '!(...)' branch and discards.
  if (!(qStep.z > 0.0 && abs(rStep - 1.0) < REFINE_TOL)) {
    discard;
  }

  let stroke = 1.0 - smoothstep(0.0, STROKE_PX, dist);

  // Trail recency via forward Kepler. delta is the mean-anomaly angle BEHIND
  // the body, wrapped into [0, 2*PI): floored-division modulo keeps it
  // non-negative even when meanAnomaly - m is negative.
  let m = ecc - in.eccentricity * sin(ecc);
  let raw = in.meanAnomaly - m;
  let delta = raw - TAU * floor(raw / TAU);
  let brightness = TRAIL_FLOOR + (1.0 - TRAIL_FLOOR) * exp(-TRAIL_DECAY * delta);

  // 'in.alpha' is the per-orbit apparent-size fade (CPU-side): full for orbits
  // comfortably above the cull threshold, ramping to 0 as they shrink toward it.
  return vec4<f32>(in.color * brightness * stroke * in.alpha, 1.0);
}

// Debug lens ('debug.showOrbitTrailImpostor'): fills the impostor geometry
// with the orbit's own trail colour, so hull and trail can be matched by eye.
// Ignores the fade alpha on purpose — geometry that is drawn but faded to
// nothing still shows, separating "faded out" from "never drawn".

@fragment
fn fsImpostorRibbon(in: VSOut) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color, 1.0); // ribbon hull, flat trail colour
}
