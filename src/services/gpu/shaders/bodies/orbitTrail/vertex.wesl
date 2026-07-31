// orbitTrail/vertex.wesl — vertex stage for the instanced screen-space conic
// orbit trail. Two entry points share one 'OrbitInstance' input (io.wesl):
// 'vs', an oversized fullscreen triangle, and 'vsRibbon', a screen-space
// ribbon hugging the projected ellipse. Both forward the same 'VSOut'
// unchanged; the fragment cannot tell which one ran.
//
// ## Why a fullscreen triangle, not a projected bounding quad ('vs')
//
// A Keplerian ellipse under perspective is a general conic, and when the orbit
// plane passes near the camera the projected conic becomes a hyperbola open to
// infinity — a finite screen-space bounding box is then either wrong or needs a
// special case exactly at that degeneracy (spec 2 rejected the bounding quad).
// A fullscreen triangle is robust for every conic type: the fragment discards
// pixels off the stroke, so covering the whole viewport costs only fragment
// work, and with a handful of additive orbits over a near-field scene that is
// cheap. The classic three-vertex oversized triangle (corners at (-1,-1),
// (3,-1), (-1,3)) covers the [-1,1] NDC square with a single primitive and no
// index buffer. 'vsRibbon' (below) instead rasterizes only the stroke's own
// footprint, trading this robustness for far less fragment work.
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

@vertex
fn vs(@builtin(vertex_index) vid: u32, inst: OrbitInstance) -> VSOut {
  var out: VSOut;
  // Oversized triangle covering the whole NDC square in one primitive.
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  out.clip = vec4<f32>(p[vid], 0.0, 1.0);

  // Forward the per-orbit conic constants flat (the .xyz of each padded Ginv
  // column is the real data; the .w lanes are alignment pad).
  out.ginv0 = inst.ginv0.xyz;
  out.ginv1 = inst.ginv1.xyz;
  out.ginv2 = inst.ginv2.xyz;
  out.color = inst.params.xyz;
  out.eccentricity = inst.params.w;
  out.meanAnomaly = inst.phase.x;
  out.alpha = inst.phase.y;
  // The affine Sampson-gradient minors (padded vec4, .xyz is the real data).
  out.minorS = inst.minorS.xyz;
  out.minorT = inst.minorT.xyz;
  return out;
}

// One sample of the projected ellipse in isotropic pixel space. Returns
// (px.x, px.y, clip.w) — the third component rides along in .z so callers can
// rebuild a valid clip-space output without re-deriving p(E).
fn ribbonSample(inst: OrbitInstance, viewportPx: vec2<f32>, si: u32) -> vec3<f32> {
  // E-parametrization clusters samples at periapsis, matching how
  // composeOrbitConic built cc/ac/bc on the CPU side.
  let e = TAU * f32(si) / f32(SEGMENTS);
  // The padded vec4 stores clip.w in its THIRD slot - (x, y, w, 0) - so the
  // swizzle is .xyz, never .xyw: the .w lane is the zero pad, and reading it
  // makes p.z zero, which silently collapses every vertex to (0,0,0,0).
  let p = inst.cc.xyz + cos(e) * inst.ac.xyz + sin(e) * inst.bc.xyz; // clip (x, y, w)
  let px = (p.xy / p.z) * 0.5 * viewportPx; // isotropic pixel space
  return vec3<f32>(px, p.z);
}

// Rasterizes each orbit as a screen-space ribbon hugging the projected
// ellipse, replacing 'vs's fullscreen triangle. vid -> (segment, corner) with
// segment = vid / 6u, corner = vid % 6u; the quad for segment i spans samples
// i and i+1, and sample SEGMENTS wraps to 0 so the strip closes. Two
// triangles per quad, keyed by (sample offset 0|1, side -1|+1) below; winding
// is irrelevant ('cullMode: none').
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

  // sample = i and i+1; % SEGMENTS folds sample SEGMENTS back to 0 so the
  // strip closes. Every quantity below is computed per SAMPLE (si), never per
  // segment: the two quads sharing sample si then emit identical corners, so
  // the strip abuts exactly under additive blend with no seam at the joint.
  let si = (segment + offset) % SEGMENTS;
  let siPrev = (si + SEGMENTS - 1u) % SEGMENTS;
  let siNext = (si + 1u) % SEGMENTS;

  let cur = ribbonSample(inst, viewportPx, si);
  let prev = ribbonSample(inst, viewportPx, siPrev);
  let next = ribbonSample(inst, viewportPx, siNext);

  // The chord tangent (samples si-1, si+1) needs no projective derivative and
  // is the direction the strip's edges actually run in.
  let chord = next.xy - prev.xy;
  let tangent = chord / max(length(chord), 1e-20); // guarded normalize, as the fragment guards its own gradients
  let normal = vec2<f32>(-tangent.y, tangent.x);

  // sag is the second difference of the chord, so a wide/near-degenerate
  // orbit widens its own ribbon; a constant margin cannot.
  let sag = abs(dot(0.5 * (prev.xy + next.xy) - cur.xy, normal));
  let halfWidth = STROKE_PX + MARGIN_PX + sag;
  let outPx = cur.xy + side * halfWidth * normal;

  // clip.z = 0: the pipeline is depthless, so 0 <= 0 <= w holds for every
  // w > 0, which ribbonEligible guarantees at every sample of this instance.
  let w = cur.z;
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
