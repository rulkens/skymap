// zoneOfAvoidance/label/io.wesl — structs for the curved on-band "Zone of
// Avoidance" lettering. VsIn mirrors labels/io.wesl's shape, but
// localOffset/localSize carry world-Mpc units (baked at construction, see
// zoneOfAvoidanceRenderer.ts) instead of atlas px, and galacticLonRad
// replaces the labelIndex indirection — each glyph is its own anchor.

import package::lib::camera::CameraUniforms;

// Uniforms, 112B: CameraUniforms(80) + color/labelRadiusMpc(16) + fadeAlpha/pad(16).
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
  @location(0) corner: vec2<f32>, // unit-quad corner (lib/unitQuad.ts)
  @location(1) localOffset: vec2<f32>, // world-Mpc pen offset (atlas-px in labels/io.wesl)
  @location(2) localSize: vec2<f32>, // same units as localOffset
  @location(3) uvRect: vec4<f32>,
  @location(4) galacticLonRad: f32, // repeat's base longitude; pen offset folds in via vertex.wesl's bandAxes
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
