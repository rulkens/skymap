// earth/io.wesl — shared inter-stage struct for the true-scale textured
// Earth. Imported by earth/vertex.wesl and earth/fragment.wesl.
//
// The Earth renders as a single unit-sphere mesh: the vertex stage
// projects each local vertex through the body MVP and forwards two things the
// fragment needs -- the mesh's equirectangular uv (for the Blue Marble sample)
// and the local-space normal (for the sun-relative Lambert term). 'VSOut' is
// the contract between those two stages.
//
// ## Why the struct lives here
//
// One authoritative inter-stage declaration makes vertex/fragment
// @location drift structurally impossible — the same reasoning
// 'star/vertex.wesl' states for importing 'TintedSphereUniforms' from
// lib/sphere. If the two stages each declared their own copy, a field
// reorder or a changed @location on one side would silently mis-wire the
// interpolants; a single imported struct removes that failure mode.
//
// ## Why forward the local normal at all
//
// On a UNIT sphere the local-space position IS the outward surface normal, so
// the vertex stage forwards 'position' unchanged as 'normalLocal'. Earth draws
// its mesh; the ray-traced bodies do not, and derive their normal from the hit
// instead. The fragment renormalizes it before the
// Lambert dot -- interpolation across a triangle face shortens the interpolated
// vector, which would otherwise band the terminator.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Equirectangular uv passed straight through for the texture sample in the
  // fragment stage. See the fragment module for the v-orientation rationale.
  @location(0) uv: vec2<f32>,
  // Unit-sphere local-space normal (== the local vertex position). The fragment
  // renormalizes this before lighting -- see the fragment module.
  @location(1) normalLocal: vec3<f32>,
  // Interpolated unit local-space +u (east) tangent, forwarded raw from the mesh.
  // The fragment Gram-Schmidt-re-orthonormalizes it against the interpolated
  // normal (interpolation across a face shortens and skews both vectors), then
  // builds the tangent-space basis for the normal-map perturbation.
  @location(2) tangent: vec3<f32>,
};
