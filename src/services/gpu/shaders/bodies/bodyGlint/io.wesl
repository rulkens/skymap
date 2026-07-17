// bodyGlint/io.wesl — shared inter-stage struct for the sub-pixel body
// glints. Imported by bodyGlint/vertex.wesl and bodyGlint/fragment.wesl.
//
// A scene body too small to resolve as a mesh renders as a single additive
// point sprite whose brightness encodes apparent size x albedo x phase (a
// crescent Venus dims, a gibbous Moon brightens). The vertex stage expands
// each glint into a screen-sized quad, sizes it from the per-body brightness,
// and forwards the quad corner plus the albedo tint ALREADY PREMULTIPLIED by
// brightness; the fragment draws a soft Gaussian dot in that tint. 'VSOut' is
// the contract between those two stages.
//
// ## Why the struct lives here
//
// One authoritative inter-stage declaration makes vertex/fragment @location
// drift structurally impossible — the same reasoning 'starPoints/io.wesl'
// states. The brightness is folded into 'color' in the vertex stage rather
// than carried as a separate varying, so the fragment is byte-for-byte the
// star-point soft-dot: a glint and a scene star read as the same species of
// glowing point.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Quad corner in [-1, +1]^2 — the fragment's distance-from-centre.
  @location(0) uv: vec2<f32>,
  // Albedo tint premultiplied by the per-body brightness, flat across the quad.
  @location(1) color: vec3<f32>,
};
