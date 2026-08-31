// planet/io.wesl — inter-stage struct for the instanced flat-lit albedo planet.
//
// The mesh is a circumscribing PROXY, not the surface: the fragment ray-traces
// the analytic unit sphere ('lib/analyticSphere.wesl'), so what it needs from
// the vertex stage is a point on the view ray, the ray ORIGIN, and the mvp to
// project the hit to depth. Vertex attributes are a vertex-stage input, so the
// per-instance record has to cross as varyings; WGSL forbids a matrix in
// inter-stage IO, hence the mvp crosses as its four columns.
//
// One authoritative declaration is what keeps the two stages' @location and
// @interpolate qualifiers from drifting apart silently.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // A point on this fragment's view ray: the interpolated PROXY position in
  // body radii. NOT unit length — 'PROXY_SCALE' inflated it.
  @location(0) localPos: vec3<f32>,
  // Everything below is one constant per planet, so all of it is flat: there
  // is nothing to interpolate across a face.
  @location(1) @interpolate(flat) albedo: vec3<f32>,
  @location(2) @interpolate(flat) sunDirLocal: vec3<f32>,
  // The camera in the body's local frame — the analytic ray's origin.
  @location(3) @interpolate(flat) camPosLocal: vec3<f32>,
  @location(4) @interpolate(flat) mvp0: vec4<f32>,
  @location(5) @interpolate(flat) mvp1: vec4<f32>,
  @location(6) @interpolate(flat) mvp2: vec4<f32>,
  @location(7) @interpolate(flat) mvp3: vec4<f32>,
};
