// stellarStreams/ribbonPick/io.wesl — the ribbon pick's uniforms and vertex-to-fragment interface.
// TS twin of 'Uniforms': stellarStreamsRibbonPickRenderer.ts's slot table.

import package::lib::camera::CameraUniforms;

struct Uniforms {
  cam: CameraUniforms,
  eye: vec3<f32>,
  minHalfWidthPx: f32,
  // packSelection(code, PICK_SENTINEL_OFFSET); plus the stream index, a stream's pick word.
  pickBase: u32,
};

struct PickOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) @interpolate(flat) word: u32,
};
