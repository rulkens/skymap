// stellarStreams/streaks/io.wesl — uniforms, the vertex-to-fragment interface and the streak
// profile shared by both stages. TS twin of 'Uniforms': stellarStreamsRenderer.ts's slot table.

import package::lib::camera::CameraUniforms;

struct Uniforms {
  cam: CameraUniforms,
  eye: vec3<f32>,
  intensity: f32,
  sizeScale: f32,
  stretch: f32,
  minPx: f32,
  timeSec: f32,
  flow: f32,
  // Every stream but this one (attr.w; −1 = none) draws at 'recede', this one at 'focusBoost'.
  focusedStream: f32,
  recede: f32,
  focusBoost: f32,
};

struct VSOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) uvPx: vec2<f32>,
  // (streak length, sprite radius) in px.
  @location(1) @interpolate(flat) shape: vec2<f32>,
  @location(2) @interpolate(flat) colour: vec3<f32>,
};

// The profile is exp(-STREAK_FALLOFF (d / rPx)²), so rPx is its 1/e² radius; the quad reaches
// STREAK_HALF_ACROSS_RADII radii out, where the profile is exp(-8) and the cut is invisible.
const STREAK_FALLOFF: f32 = 2.0;
const STREAK_HALF_ACROSS_RADII: f32 = 2.0;
