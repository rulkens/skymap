// earth/io.wesl — shared inter-stage struct for the true-scale textured
// Earth. Imported by earth/vertex.wesl and earth/fragment.wesl.
//
// The Earth renders as a single unit-sphere mesh: the vertex stage
// projects each local vertex through the body MVP and forwards the mesh's
// equirectangular uv; the fragment stage samples the Blue Marble texture
// at that uv. 'VSOut' is the contract between those two stages.
//
// ## Why the struct lives here
//
// One authoritative inter-stage declaration makes vertex/fragment
// @location drift structurally impossible — the same reasoning
// 'star/vertex.wesl' states for importing 'TintedSphereUniforms' from
// lib/sphere. If the two stages each declared their own copy, a field
// reorder or a changed @location on one side would silently mis-wire the
// interpolants; a single imported struct removes that failure mode.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Equirectangular uv passed straight through for the texture sample in the
  // fragment stage. See the fragment module for the v-orientation rationale.
  @location(0) uv: vec2<f32>,
};
