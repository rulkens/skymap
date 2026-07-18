// orbitTrail/vertex.wesl — vertex stage for the instanced screen-space conic
// orbit trail.
//
// This stage emits a fullscreen triangle from '@builtin(vertex_index)' rather
// than projecting plane geometry: it draws a single oversized triangle in clip
// space that covers the whole viewport, and forwards the per-orbit conic
// constants unchanged. All the real geometry lives in the fragment, which
// back-projects each pixel through 'Ginv' (spec 3.3).
//
// ## Why a fullscreen triangle, not a projected bounding quad
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
// index buffer.
//
// ## Why per-instance attributes, not a per-draw uniform
//
// One renderer draws every orbit in a SINGLE instanced 'draw(3, n)'. Each
// orbit's 'Ginv' columns + colour + eccentricity + mean anomaly arrive as
// instance-step vertex attributes (one record per '@builtin(instance_index)'),
// not a uniform mutated between draws. That is the house idiom
// ('planetRenderer'): one 'writeBuffer' + one draw beats
// N per-orbit binds, and it dodges the writeBuffer-vs-submit race by
// construction, since every instance reads its own baked record. WESL has no
// mat3 vertex-attribute type, so 'Ginv' streams as three vec4<f32> (the padded
// mat3x3 columns) and only the .xyz of each carries data.
//
// ## Attribute layout (matches the TS pipeline descriptor byte-for-byte)
//
//   @location(1) ginv0: vec4<f32>  — Ginv column 0 (.xyz used, .w pad)  } per-
//   @location(2) ginv1: vec4<f32>  — Ginv column 1                       } instance
//   @location(3) ginv2: vec4<f32>  — Ginv column 2                       } record,
//   @location(4) params: vec4<f32> — color.rgb in .xyz, eccentricity .w  } stride
//   @location(5) phase: vec4<f32>  — meanAnomalyRad .x, fade alpha .y, .zw pad } 112 B
//   @location(6) minorS: vec4<f32> — gradient minors M1/M2/M3 in .xyz, .w pad
//   @location(7) minorT: vec4<f32> — gradient minors M4/M5/M6 in .xyz, .w pad

import package::bodies::orbitTrail::io::VSOut;

@vertex
fn vs(
  @builtin(vertex_index) vid: u32,
  @location(1) ginv0: vec4<f32>,
  @location(2) ginv1: vec4<f32>,
  @location(3) ginv2: vec4<f32>,
  @location(4) params: vec4<f32>,
  @location(5) phase: vec4<f32>,
  @location(6) minorS: vec4<f32>,
  @location(7) minorT: vec4<f32>,
) -> VSOut {
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
  out.ginv0 = ginv0.xyz;
  out.ginv1 = ginv1.xyz;
  out.ginv2 = ginv2.xyz;
  out.color = params.xyz;
  out.eccentricity = params.w;
  out.meanAnomaly = phase.x;
  out.alpha = phase.y;
  // The affine Sampson-gradient minors (padded vec4, .xyz is the real data).
  out.minorS = minorS.xyz;
  out.minorT = minorT.xyz;
  return out;
}
