// orbitTrail/vertex.wesl — vertex stage for the instanced screen-space conic
// orbit trail. One entry point, 'vsRibbon', consuming one 'OrbitInstance'
// (io.wesl) and forwarding one 'VSOut' to the shared fragment module.
//
// The CPU hands every instance its in-front-of-camera arc [eStart, eSpan]
// (composeOrbitConic, closed-form near-plane clip), so EVERY sample here has
// clip.w > 0 by construction — no fold handling, no clamping, no oversized
// coverage geometry can exist. A closed orbit (eSpan == TAU) wraps its strip
// exactly; an open arc runs end to end with one-sided tangents at its ends,
// whose huge off-screen endpoint positions the hardware clipper removes.

import package::bodies::orbitTrail::constants::MARGIN_PX;
import package::bodies::orbitTrail::constants::SEGMENTS;
import package::bodies::orbitTrail::constants::STROKE_PX;
import package::bodies::orbitTrail::io::OrbitInstance;
import package::bodies::orbitTrail::io::VSOut;
import package::lib::math::TAU;

// One sample of the projected ellipse in raw clip space (x, y, w) — no divide
// yet. The padded vec4 stores clip.w in its THIRD slot - (x, y, w, 0) - so the
// swizzle is .xyz, never .xyw: the .w lane is the zero pad, and reading it
// makes p.z zero, which silently collapses every vertex to (0,0,0,0).
fn ribbonClip(inst: OrbitInstance, si: u32) -> vec3<f32> {
  let e = inst.arc.x + inst.arc.y * f32(si) / f32(SEGMENTS);
  return inst.cc.xyz + cos(e) * inst.ac.xyz + sin(e) * inst.bc.xyz; // clip (x, y, w)
}

// Perspective divide; valid everywhere here — the CPU arc clip guarantees
// clip.z (== clip.w) > 0 for every sample index.
fn clipToPixel(clip: vec3<f32>, viewportPx: vec2<f32>) -> vec2<f32> {
  return (clip.xy / clip.z) * 0.5 * viewportPx;
}

// Rasterizes each orbit arc as a screen-space ribbon hugging the projected
// curve. vid -> (segment, corner) with segment = vid / 6u, corner = vid % 6u;
// the quad for segment i spans samples i and i+1. Two triangles per quad,
// keyed by (sample offset 0|1, side -1|+1); winding is irrelevant
// ('cullMode: none'). Corner positions are a pure function of the sample
// index, so the two quads sharing a sample abut exactly — no additive seam.
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
  let closed = inst.arc.y >= TAU - 1e-4;

  // Own sample and its true neighbours. Closed strips index modulo SEGMENTS
  // (sample SEGMENTS is then BIT-IDENTICAL to sample 0, keeping the seam
  // exact); open arcs clamp, degenerating the end tangents to the one-sided
  // chord along the arc itself.
  let siRaw = segment + offset;
  let si = select(siRaw, siRaw % SEGMENTS, closed);
  let prevIdx = select(max(si, 1u) - 1u, (si + SEGMENTS - 1u) % SEGMENTS, closed);
  let nextIdx = select(min(si + 1u, SEGMENTS), (si + 1u) % SEGMENTS, closed);

  let ownRaw = ribbonClip(inst, si);
  let ownPx = clipToPixel(ownRaw, viewportPx);
  let prevPx = clipToPixel(ribbonClip(inst, prevIdx), viewportPx);
  let nextPx = clipToPixel(ribbonClip(inst, nextIdx), viewportPx);

  let chord = nextPx - prevPx;
  let tangent = chord / max(length(chord), 1e-20);
  let normal = vec2<f32>(-tangent.y, tangent.x);
  // sag is the second difference of the chord: a segment turning faster than
  // the sampling tracks widens its own band, so the curve stays inside it.
  let sag = abs(dot(0.5 * (prevPx + nextPx) - ownPx, normal));
  let halfWidth = STROKE_PX + MARGIN_PX + sag;
  let outPx = ownPx + side * halfWidth * normal;

  out.clip = vec4<f32>((outPx / (0.5 * viewportPx)) * ownRaw.z, 0.0, ownRaw.z);

  out.ginv0 = inst.ginv0.xyz;
  out.ginv1 = inst.ginv1.xyz;
  out.ginv2 = inst.ginv2.xyz;
  out.color = inst.params.xyz;
  out.eccentricity = inst.params.w;
  out.meanAnomaly = inst.phase.x;
  out.alpha = inst.phase.y;
  return out;
}
