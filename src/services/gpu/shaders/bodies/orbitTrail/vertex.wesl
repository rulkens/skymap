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
// yet, so callers can test/clamp .z (== clip.w) before it hits a denominator.
fn ribbonClip(inst: OrbitInstance, si: u32) -> vec3<f32> {
  // E-parametrization clusters samples at periapsis, matching how
  // composeOrbitConic built cc/ac/bc on the CPU side.
  let e = TAU * f32(si) / f32(SEGMENTS);
  // The padded vec4 stores clip.w in its THIRD slot - (x, y, w, 0) - so the
  // swizzle is .xyz, never .xyw: the .w lane is the zero pad, and reading it
  // makes p.z zero, which silently collapses every vertex to (0,0,0,0).
  return inst.cc.xyz + cos(e) * inst.ac.xyz + sin(e) * inst.bc.xyz; // clip (x, y, w)
}

// Perspective divide; shared by the fully-front, one-sided, and clamped
// paths below. Only valid where clip.z (== clip.w) > 0.
fn clipToPixel(clip: vec3<f32>, viewportPx: vec2<f32>) -> vec2<f32> {
  return (clip.xy / clip.z) * 0.5 * viewportPx;
}

// Twice the farthest corner of the CENTRED viewport box (clipToPixel's own
// space, [-W/2, W/2] x [-H/2, H/2], NOT [0, W] x [0, H]) from anchorPx.
// Only safe where the fragment's eOwn discard stops it double-painting.
fn foldHalfWidth(anchorPx: vec2<f32>, viewportPx: vec2<f32>) -> f32 {
  return 2.0 * length(abs(anchorPx) + 0.5 * viewportPx);
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

  // Segment endpoints (sI, sJ = sI+1) plus one extra neighbour each side.
  let sI = segment;
  let sJ = (segment + 1u) % SEGMENTS;
  let sIPrev = (sI + SEGMENTS - 1u) % SEGMENTS;
  let sJNext = (sJ + 1u) % SEGMENTS;
  let rawIPrev = ribbonClip(inst, sIPrev);
  let rawI = ribbonClip(inst, sI);
  let rawJ = ribbonClip(inst, sJ);
  let rawJNext = ribbonClip(inst, sJNext);

  // Per-instance scale-free near-plane epsilon: |cc.z| + hypot(ac.z, bc.z)
  // bounds clip.w's amplitude over every E. 1e-6 is load-bearing: it must sit
  // well above f32 relative precision (~1.2e-7), or a clamped w can round to
  // <= 0 and clipToPixel divides by zero.
  let epsW = 1e-6 * (abs(inst.cc.z) + length(vec2<f32>(inst.ac.z, inst.bc.z)));

  // Fold membership per QUAD: tested iff any of the four samples above is
  // behind; eOwn carries [eLo, eHi) for fragment.wesl's ownership test.
  let tested = rawIPrev.z <= epsW || rawI.z <= epsW || rawJ.z <= epsW || rawJNext.z <= epsW;
  out.eOwn = vec3<f32>(
    TAU * f32(segment) / f32(SEGMENTS),
    TAU * f32(segment + 1u) / f32(SEGMENTS),
    select(0.0, 1.0, tested),
  );

  // This corner's own sample and its TRUE neighbours (si-1, si+1), never the
  // segment's other endpoint — classifying on these makes a corner a pure
  // function of the sample index, so the two quads sharing si always agree.
  let ownRaw = select(rawJ, rawI, offset == 0u);
  let prevRaw = select(rawI, rawIPrev, offset == 0u);
  let nextRaw = select(rawJNext, rawJ, offset == 0u);
  // The CURRENT segment's OTHER endpoint — read by the straddle and clamp
  // branches below (per-segment, not per-sample, deliberately allowed there).
  let partnerRaw = select(rawI, rawJ, offset == 0u);

  let ownFront = ownRaw.z > epsW;
  let prevFront = prevRaw.z > epsW;
  let nextFront = nextRaw.z > epsW;

  var outPx: vec2<f32>;
  var w: f32;

  if (ownFront && prevFront && nextFront) {
    // Fully in front: today's central-difference + sag width, UNCHANGED. A
    // widened corner's quad is always in the tested fold group (see below).
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
  } else if (ownFront && partnerRaw.z <= epsW) {
    // The segment STRADDLES the near plane: unbounded viewport-box coverage
    // is needed only here (a straddling stroke's screen extent is itself
    // unbounded). Widening every fold-adjacent corner this way cost ~4
    // viewport quads per near-plane crossing per orbit — a fill catastrophe.
    let ownAnchor = clipToPixel(ownRaw, viewportPx);
    let t = (epsW - partnerRaw.z) / (ownRaw.z - partnerRaw.z);
    let otherAnchor = clipToPixel(mix(partnerRaw, ownRaw, t), viewportPx);
    let axisChord = ownAnchor - otherAnchor;
    let axisOut = axisChord / max(length(axisChord), 1e-20); // guarded; zero if anchors coincide (segment projects to a point)
    let axisNormal = vec2<f32>(-axisOut.y, axisOut.x);
    let h = foldHalfWidth(ownAnchor, viewportPx);
    // axisOut flips sign per quad end (points outward at each), so 'side'
    // must flip with it or the two triangles bowtie and shed a wedge.
    let sideOut = select(-side, side, offset == 1u);
    outPx = ownAnchor + h * axisOut + sideOut * h * axisNormal;
    w = ownRaw.z;
  } else if (ownFront) {
    // MIXED: endpoints front, but the corner's OUTER neighbour is behind —
    // narrow ribbon (see straddle branch above for why). One-sided tangent
    // toward the FRONT true neighbour, a pure function of 'own' — so both
    // quads sharing this sample agree. No sag; any sliver joins the straddle.
    let ownPx = clipToPixel(ownRaw, viewportPx);
    var chord = clipToPixel(nextRaw, viewportPx) - ownPx;
    if (prevFront) {
      chord = ownPx - clipToPixel(prevRaw, viewportPx);
    }
    let tangent = chord / max(length(chord), 1e-20);
    let normal = vec2<f32>(-tangent.y, tangent.x);
    let halfWidth = STROKE_PX + MARGIN_PX;
    outPx = ownPx + side * halfWidth * normal;
    w = ownRaw.z;
  } else if (partnerRaw.z > epsW) {
    // Own behind, this segment's OTHER endpoint in front: clamp toward it
    // along the segment's own chord to w = epsW (per-SEGMENT, off-viewport).
    let t = (epsW - ownRaw.z) / (partnerRaw.z - ownRaw.z);
    let clampedRaw = mix(ownRaw, partnerRaw, t);
    let ownAnchor = clipToPixel(clampedRaw, viewportPx);
    let otherAnchor = clipToPixel(partnerRaw, viewportPx); // always front in this branch
    // ONE shared axis per quad end, not each end's own local tangent (two
    // per-end tangents can diverge >=90deg near a fold and miss the
    // viewport). Mismatch with the adjacent quad's version of this shared
    // corner is covered by E-ownership (both quads tested), not abutment.
    let axisChord = ownAnchor - otherAnchor;
    let axisOut = axisChord / max(length(axisChord), 1e-20);
    let axisNormal = vec2<f32>(-axisOut.y, axisOut.x);
    let h = foldHalfWidth(ownAnchor, viewportPx); // same shared-axis frame as the straddle branch above
    let sideOut = select(-side, side, offset == 1u); // same per-end flip as above
    outPx = ownAnchor + h * axisOut + sideOut * h * axisNormal;
    w = epsW;
  } else {
    // Both endpoints behind: this arc is entirely behind-camera, so it stays
    // degenerate — no pixel here needs the fragment's own q.z discard.
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
  return out;
}
