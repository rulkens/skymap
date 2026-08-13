// zoneOfAvoidance/label/io.wesl — shared structs for the curved on-band
// "ZONE OF AVOIDANCE" lettering. Sibling pipeline to the band's own
// ray-marched fullscreen shell (one level up): that pass reconstructs a
// per-pixel view ray, this one places discrete MSDF glyph quads fixed in
// world space (no camera read in the placement math — see vertex.wesl).
//
// VsIn mirrors labels/io.wesl's per-glyph attribute SHAPE
// (localOffset/localSize/uvRect unchanged), but 'localOffset'/'localSize'
// carry WORLD-Mpc-equivalent units instead of atlas px (baked once at
// construction — see zoneOfAvoidanceRenderer.ts), and 'galacticLonRad'
// replaces the labelIndex indirection: every glyph here is intrinsically
// anchored to one point on the band, not a shared label anchor, so there is
// no per-label storage buffer to look up.

import package::lib::camera::CameraUniforms;

// ── Uniforms layout (112 bytes) ──────────────────────────────────────
//
//   offset  0: CameraUniforms (viewProj + viewportPx + 8B pad)   [80 B]
//   offset 80: color (vec3<f32>) + labelRadiusMpc (f32)          [16 B]
//   offset 96: fadeAlpha (f32) + _pad0/_pad1/_pad2 (f32 x3)      [16 B]
//
// 'labelRadiusMpc' trails 'color' the same way zoneOfAvoidance/io.wesl's
// 'color: vec3<f32>, bulgeDeg: f32' pair fills a vec3's alignment padding
// for free — see that file's comment for the general pattern.

struct Uniforms {
  cam: CameraUniforms,
  color: vec3<f32>,
  labelRadiusMpc: f32,
  fadeAlpha: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

struct VsIn {
  // (0,0) (1,0) (0,1) (1,1) — unit-corner attribute, shared static buffer
  // (lib/unitQuad.ts), expanded into a glyph quad in the vertex stage.
  @location(0) corner: vec2<f32>,
  // Pen-relative top-left of the glyph, in WORLD-Mpc-equivalent units (the
  // physical em size baked at construction, analogous to labels' worldEmMpc
  // — see the renderer for the atlas-px -> Mpc conversion).
  @location(1) localOffset: vec2<f32>,
  // Glyph w/h, same Mpc-equivalent units as localOffset.
  @location(2) localSize: vec2<f32>,
  // (u0, v0, u1, v1) — atlas region for this glyph.
  @location(3) uvRect: vec4<f32>,
  // This glyph's repeat's base galactic longitude (radians). The glyph's
  // own pen offset is folded in as an arc-angle in the vertex stage, via
  // 'bandAxes' — see that function's doc comment for the derivation.
  @location(4) galacticLonRad: f32,
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
