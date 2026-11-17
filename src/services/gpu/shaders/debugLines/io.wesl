// debugLines/io.wesl — structs for the debug-draw pass's thick lines
// (`debugLineRenderer`): world segments drawn as screen-aligned quads,
// premultiplied OVER, so a debug route occludes rather than accumulates.
//
// One instance per segment. The unit-quad uv picks the endpoint (uv.x) and
// the side (uv.y, ±half-width along the screen-space perpendicular). The one
// binding is the shared CameraUniforms prefix; per-line state rides the
// instance attributes (`lib/debugLineInstanceLayout.ts`, 48 bytes):
//
//   [0..15]  fromAndWidth  vec4<f32>  (from.xyz world Mpc, full pixel width)
//   [16..31] toAndAlpha    vec4<f32>  (to.xyz world Mpc, fadeAlpha)
//   [32..47] color         vec4<f32>  (rgba premultiplied)

import package::lib::camera::CameraUniforms;

struct Uniforms {
  // 80-byte universal camera prefix; the CPU writer zeroes its pad.
  cam: CameraUniforms,
};

struct VsIn {
  @location(0) uv: vec2<f32>,
  @location(1) fromAndWidth: vec4<f32>,
  @location(2) toAndAlpha: vec4<f32>,
  @location(3) color: vec4<f32>,
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  // linear: an across-width coordinate (lib/segmentQuad.wesl's header).
  @location(0) @interpolate(linear) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
};
