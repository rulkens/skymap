// labels3d/io.wesl — structs for the shared world-geometry text renderer.
// Generalizes zoneOfAvoidance/label/io.wesl (one fixed galactic-plane band)
// to any number of labels, each with its own arc placement, font, and
// repeat count — using labels/io.wesl's per-label storage-buffer /
// per-glyph instance-buffer indirection so multiple labels share one draw.

import package::lib::camera::CameraUniforms;

struct Uniforms {
  cam: CameraUniforms,
};

// 80B: center+radiusMpc(16) + planeNormal+emMpc(16) + referenceDir+
// startAngleRad(16) + color(16) + fadeAlpha+repeatCount+pad(16).
struct Label3DData {
  center: vec3<f32>,
  radiusMpc: f32,
  planeNormal: vec3<f32>,
  emMpc: f32,
  referenceDir: vec3<f32>,
  startAngleRad: f32,
  color: vec4<f32>, // premultiplied rgba fill
  fadeAlpha: f32,
  repeatCount: u32,
  _pad0: f32,
  _pad1: f32,
};

struct VsIn {
  @location(0) corner: vec2<f32>,
  @location(1) localOffset: vec2<f32>, // atlas px — converted to Mpc in the vertex stage
  @location(2) localSize: vec2<f32>, // atlas px
  @location(3) uvRect: vec4<f32>,
  @location(4) labelIndex: u32, // index into labels[] storage buffer
  @location(5) repeatIndex: u32, // which of repeatCount copies this glyph belongs to
  @location(6) fontIndex: u32, // texture_2d_array layer index
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>, // fill colour, pre-multiplied by fadeAlpha
  @location(2) @interpolate(flat) fontIndex: u32,
};
