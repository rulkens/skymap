// orbitTrail/vertex.wesl — vertex stage for the instanced screen-space conic
// orbit trail. One entry point, 'vsRibbon', consuming one 'OrbitInstance'
// input (io.wesl) and forwarding one 'VSOut' (io.wesl) to the shared
// fragment module.
//
// ## Why a screen-space ribbon, near-plane-clamped
//
// A Keplerian ellipse's perspective projection is a general conic; near the
// orbit plane it turns into a hyperbola with points behind the camera
// (clip.w <= 0). Each segment endpoint below a per-orbit near-plane epsilon
// is CLAMPED to its w = epsW crossing instead of dropped, so one ribbon
// covers every projection — including a camera sitting inside the orbit —
// with no separate fallback geometry.
//
// ## Why per-instance attributes, not a per-draw uniform
//
// One renderer draws every orbit in a SINGLE instanced draw call. Each
// orbit's 'Ginv' columns + colour + eccentricity + mean anomaly arrive as
// instance-step vertex attributes (one record per '@builtin(instance_index)'),
// not a uniform mutated between draws. That is the house idiom
// ('planetRenderer'): one 'writeBuffer' + one draw beats
// N per-orbit binds, and it dodges the writeBuffer-vs-submit race by
// construction, since every instance reads its own baked record. WESL has no
// mat3 vertex-attribute type, so 'Ginv' streams as three vec4<f32> (the padded
// mat3x3 columns) and only the .xyz of each carries data. The full attribute
// layout is 'OrbitInstance' in orbitTrail/io.wesl — declared there once so
// this file cannot drift from it.

import package::bodies::orbitTrail::constants::MARGIN_PX;
import package::bodies::orbitTrail::constants::SEGMENTS;
import package::bodies::orbitTrail::constants::STROKE_PX;
import package::bodies::orbitTrail::io::OrbitInstance;
import package::bodies::orbitTrail::io::VSOut;
import package::lib::math::TAU;

// One sample of the projected ellipse in raw clip space (x, y, w) — no divide
// yet, so callers can test/clamp .z (== clip.w) before it ever lands in a
// denominator.
fn ribbonClip(inst: OrbitInstance, si: u32) -> vec3<f32> {
  // E-parametrization clusters samples at periapsis, matching how
  // composeOrbitConic built cc/ac/bc on the CPU side.
  let e = TAU * f32(si) / f32(SEGMENTS);
  // The padded vec4 stores clip.w in its THIRD slot - (x, y, w, 0) - so the
  // swizzle is .xyz, never .xyw: the .w lane is the zero pad, and reading it
  // makes p.z zero, which silently collapses every vertex to (0,0,0,0).
  return inst.cc.xyz + cos(e) * inst.ac.xyz + sin(e) * inst.bc.xyz; // clip (x, y, w)
}

// Perspective divide, isolated so both the fast (fully-front) and clamped
// paths below share one conversion. Only valid where clip.z (== clip.w) > 0.
fn clipToPixel(clip: vec3<f32>, viewportPx: vec2<f32>) -> vec2<f32> {
  return (clip.xy / clip.z) * 0.5 * viewportPx;
}

// Rasterizes each orbit as a screen-space ribbon hugging the projected
// ellipse. vid -> (segment, corner) with segment = vid / 6u, corner = vid % 6u;
// the quad for segment i spans samples i and i+1, and sample SEGMENTS wraps
// to 0 so the strip closes. Two triangles per quad, keyed by (sample offset
// 0|1, side -1|+1) below; winding is irrelevant ('cullMode: none').
@vertex
fn vsRibbon(@builtin(vertex_index) vid: u32, inst: OrbitInstance) -> VSOut {
  var out: VSOut;

  let segment = vid / 6u;
  let corner = vid % 6u;
  var cornerOffset = array<u32, 6>(0u, 0u, 1u, 1u, 0u, 1u);
  var cornerSide = array<f32, 6>(-1.0, 1.0, -1.0, -1.0, 1.0, 1.0);
  let offset = cornerOffset[corner];
  let side = cornerSide[corner];

  let viewportPx = vec2<f32>(inst.phase.z, inst.phase.w);

  // Segment endpoints (sI, sJ = sI+1) plus the one extra neighbour on each
  // side that a fully-front corner's central-difference tangent reads below.
  let sI = segment;
  let sJ = (segment + 1u) % SEGMENTS;
  let sIPrev = (sI + SEGMENTS - 1u) % SEGMENTS;
  let sJNext = (sJ + 1u) % SEGMENTS;
  let rawIPrev = ribbonClip(inst, sIPrev);
  let rawI = ribbonClip(inst, sI);
  let rawJ = ribbonClip(inst, sJ);
  let rawJNext = ribbonClip(inst, sJNext);

  // Per-instance scale-free near-plane epsilon: |cc.z| + hypot(ac.z, bc.z)
  // bounds clip.w's amplitude over every E, so it tracks this orbit's scale.
  // 1e-6 is load-bearing: it must sit well above f32 relative precision
  // (~1.2e-7), or a clamped w can round to <= 0 and clipToPixel divides by
  // zero.
  let epsW = 1e-6 * (abs(inst.cc.z) + length(vec2<f32>(inst.ac.z, inst.bc.z)));

  // This corner's own sample and its TRUE neighbours (si-1, si+1), never the
  // segment's other endpoint — classifying on these makes a corner a pure
  // function of the sample index, so the two segments sharing sample si
  // always derive the identical corner wherever that matters (see below).
  let ownRaw = select(rawJ, rawI, offset == 0u);
  let prevRaw = select(rawI, rawIPrev, offset == 0u);
  let nextRaw = select(rawJNext, rawJ, offset == 0u);
  // The CURRENT segment's OTHER endpoint — read only once 'own' is behind,
  // where a per-segment (not per-sample) answer is deliberately allowed.
  let partnerRaw = select(rawI, rawJ, offset == 0u);

  let ownFront = ownRaw.z > epsW;
  let prevFront = prevRaw.z > epsW;
  let nextFront = nextRaw.z > epsW;

  var outPx: vec2<f32>;
  var w: f32;

  if (ownFront && prevFront && nextFront) {
    // Fully in front, INCLUDING both true neighbours: today's central-
    // difference + sag math, unchanged.
    let ownPx = clipToPixel(ownRaw, viewportPx);
    let prevPx = clipToPixel(prevRaw, viewportPx);
    let nextPx = clipToPixel(nextRaw, viewportPx);
    let chord = nextPx - prevPx; // needs no projective derivative; the direction the strip's edges actually run in
    let tangent = chord / max(length(chord), 1e-20); // guarded normalize, as the fragment guards its own gradients
    let normal = vec2<f32>(-tangent.y, tangent.x);
    // sag is the second difference of the chord, so a wide/near-degenerate
    // orbit widens its own ribbon; a constant margin cannot.
    let sag = abs(dot(0.5 * (prevPx + nextPx) - ownPx, normal));
    let halfWidth = STROKE_PX + MARGIN_PX + sag;
    outPx = ownPx + side * halfWidth * normal;
    w = ownRaw.z;
  } else if (ownFront) {
    // Own sample is in front but a TRUE neighbour is behind: one-sided
    // tangent toward whichever neighbour is still front. Still a pure
    // function of 'own', so both segments sharing this sample agree.
    let ownPx = clipToPixel(ownRaw, viewportPx);
    var chord = vec2<f32>(0.0, 0.0);
    if (prevFront) {
      chord = ownPx - clipToPixel(prevRaw, viewportPx);
    } else if (nextFront) {
      chord = clipToPixel(nextRaw, viewportPx) - ownPx;
    }
    let tangent = chord / max(length(chord), 1e-20);
    let normal = vec2<f32>(-tangent.y, tangent.x);
    let halfWidth = STROKE_PX + MARGIN_PX; // no sag: the second difference needs both neighbours
    outPx = ownPx + side * halfWidth * normal;
    w = ownRaw.z;
  } else if (partnerRaw.z > epsW) {
    // Own sample is behind, this segment's OTHER endpoint is in front: clamp
    // toward it along the segment's own chord to w = epsW. Deliberately
    // per-SEGMENT — the neighbouring segment clamps toward a different
    // partner, so the two corners here may differ, but only off-viewport.
    let t = (epsW - ownRaw.z) / (partnerRaw.z - ownRaw.z);
    let clampedRaw = mix(ownRaw, partnerRaw, t);
    let clampedPx = clipToPixel(clampedRaw, viewportPx);
    let partnerPx = clipToPixel(partnerRaw, viewportPx);
    let chord = partnerPx - clampedPx;
    let tangent = chord / max(length(chord), 1e-20);
    let normal = vec2<f32>(-tangent.y, tangent.x);
    let halfWidth = STROKE_PX + MARGIN_PX; // no sag term: only two points on this path
    outPx = clampedPx + side * halfWidth * normal;
    w = epsW;
  } else {
    // Both this segment's endpoints are behind: collapse to one point. Zero
    // area means zero fragments no matter where it lands, so the origin is
    // chosen only because it needs no divide to reach.
    outPx = vec2<f32>(0.0, 0.0);
    w = 1.0;
  }

  out.clip = vec4<f32>((outPx / (0.5 * viewportPx)) * w, 0.0, w);

  out.ginv0 = inst.ginv0.xyz;
  out.ginv1 = inst.ginv1.xyz;
  out.ginv2 = inst.ginv2.xyz;
  out.color = inst.params.xyz;
  out.eccentricity = inst.params.w;
  out.meanAnomaly = inst.phase.x;
  out.alpha = inst.phase.y;
  out.minorS = inst.minorS.xyz;
  out.minorT = inst.minorT.xyz;
  return out;
}
