// texturedBody/io.wesl — shared inter-stage struct for the textured planet /
// moon renderer. Imported by texturedBody/vertex.wesl and
// texturedBody/fragment.wesl.
//
// A textured body renders as a single unit-sphere mesh: the vertex stage
// projects each local vertex through the body MVP and forwards two things the
// fragment needs -- the equirectangular uv (for the surface sample) and the
// local-space normal (for the sun-relative Lambert term). 'VSOut' is the
// contract between those two stages.
//
// ## Why the struct lives here
//
// One authoritative inter-stage declaration makes vertex/fragment @location
// drift structurally impossible -- the same reasoning 'earth/io.wesl' states.
// If the two stages each declared their own copy, a field reorder or a changed
// @location on one side would silently mis-wire the interpolants.
//
// ## Why forward the local normal at all
//
// On a UNIT sphere the local-space position IS the outward surface normal, so
// the vertex stage forwards 'position' unchanged as 'normalLocal'. The
// alternative -- reconstructing the normal in the fragment from screen-space
// derivatives -- is both noisier and needless when the mesh already carries the
// exact analytic normal. The fragment renormalizes it (interpolation across a
// triangle face shortens the interpolated vector) before the Lambert dot.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Equirectangular uv passed straight through for the texture sample.
  @location(0) uv: vec2<f32>,
  // Unit-sphere local-space normal (== the local vertex position). The fragment
  // renormalizes this before lighting -- see the fragment module.
  @location(1) normalLocal: vec3<f32>,
};
