// planet/io.wesl — shared inter-stage struct for the instanced flat-lit
// albedo planet. Imported by planet/vertex.wesl and planet/fragment.wesl.
//
// Each seeded planet renders as a unit-sphere billboard body: the vertex
// stage projects the local vertex through the per-instance MVP and
// forwards both the local position (which doubles as the outward surface
// normal on a unit sphere) and the per-instance albedo; the fragment stage
// runs a single lambert term against that normal and modulates the albedo.
// 'VSOut' is the contract between those two stages.
//
// ## Why the struct lives here
//
// One authoritative inter-stage declaration makes vertex/fragment
// @location drift structurally impossible — the same reasoning
// 'star/vertex.wesl' states for importing 'TintedSphereUniforms' from
// lib/sphere. The albedo varying in particular MUST stay
// '@interpolate(flat)' on both sides (one solid colour per planet, and a
// non-flat integer/discrete varying would be meaningless to interpolate);
// declaring it once here means the flat qualifier cannot silently diverge
// between the stages.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Local-space position passed through for the lambert term in the fragment
  // stage. Unit sphere: localPos == outward surface normal.
  @location(0) localPos: vec3<f32>,
  // Per-instance albedo forwarded flat — one solid colour per planet, no
  // cross-vertex interpolation to do.
  @location(1) @interpolate(flat) albedo: vec3<f32>,
};
