// ring/io.wesl -- shared inter-stage struct for the translucent planetary-ring
// renderer. Imported by ring/vertex.wesl and ring/fragment.wesl.
//
// The ring draws as a flat annulus (a disc with a per-draw hole) in the host
// body's equatorial plane. The vertex stage projects each annulus point through
// the body MVP and forwards the point's position in the body's LOCAL frame -- the
// single thing the fragment needs. From that local position the fragment derives
// BOTH:
//
//   - the normalized radius for the radial alpha strip u (using the uniform
//     inner ratio), and
//   - the origin of the sun-shadow ray (planet-on-ring shadow).
//
// One authoritative inter-stage declaration keeps the vertex/fragment @location
// wiring from drifting -- the same reasoning 'earth/io.wesl' /
// 'texturedBody/io.wesl' state. Only 'localPos' is forwarded because the ring
// point is planar (z = 0) and both fragment jobs are functions of that one
// vector; there is no interpolated normal (the ring plane normal is the constant
// local +z, computed in the fragment).

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // The annulus point in the body's LOCAL frame (z = 0, outer radius 1). The
  // fragment reads its radius for the strip u and casts the sun-shadow ray from
  // it.
  @location(0) localPos: vec3<f32>,
};
