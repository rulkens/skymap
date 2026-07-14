// starPoints/io.wesl — shared inter-stage struct for the distant scene
// stars. Imported by starPoints/vertex.wesl and starPoints/fragment.wesl.
//
// The neighbourhood's stars render as additive point-sprite billboards:
// the vertex stage expands each seeded star into a screen-sized quad and
// forwards the quad corner (the fragment's distance-from-centre) plus the
// per-star linear-RGB tint; the fragment stage draws a soft Gaussian dot in
// that tint. 'VSOut' is the contract between those two stages.
//
// ## Why the struct lives here
//
// One authoritative inter-stage declaration makes vertex/fragment
// @location drift structurally impossible — the same reasoning
// 'star/vertex.wesl' states for importing 'TintedSphereUniforms' from
// lib/sphere. Even though only one fragment stage consumes this struct
// today, sharing the single declaration keeps the corner + tint locations
// locked to the vertex stage that produces them.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Quad corner in [-1, +1]^2 — the fragment's distance-from-centre.
  @location(0) uv: vec2<f32>,
  // Per-star linear-RGB tint, flat across the quad.
  @location(1) color: vec3<f32>,
};
