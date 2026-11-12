// asteroids/points/io.wesl — the dots' uniforms and varyings. TS twin: asteroidPointRenderer.ts's
// ASTEROID_UNIFORM_OFFSETS, pinned by asteroidPoints.parity.test.ts.

import package::lib::camera::CameraUniforms;

// Group 0 bindings 0-1 belong to lib/trailOcclusion; this is binding 2. 'cam.viewProj' takes
// eye-relative Mpc. 'sunFromCamAu' is the Sun minus this view's eye, composed in f64 on the CPU, so
// f32 never carries the eye's distance from the origin. 'classColor' is the tint per class in rgb and
// the class fade in w (the cull on it is the compute's). 'selectedRow' (0xFFFFFFFF = none) draws at
// 'selectedCamRelAu', the CPU mirror's f64 position, so a followed dot sits on the camera target.
struct AsteroidUniforms {
  cam: CameraUniforms,
  sunFromCamAu: vec3<f32>,
  windowFade: f32,
  classColor: array<vec4<f32>, 5>,
  selectedCamRelAu: vec3<f32>,
  selectedRow: u32,
  // Pick only: the packed pick word of row 0 (pick code and sentinel offset folded in on the CPU).
  pickBase: u32,
  sizePx: f32,
  selectedRadiusPx: f32,
  // A dot's peak ceiling; the fragment's knee reads it, and the selected dot's gain is its inverse.
  dotKnee: f32,
  // The brightness budget's lift on the dots it keeps, so the thinned field keeps its light.
  thinGain: f32,
  // Size by H, in stored H units: scale 1 from the knee down, t² up to 'sizeMaxScale' at the full H.
  // A max scale of 1 is the uniform mode.
  sizeKneeHCenti: f32,
  sizeFullHCenti: f32,
  sizeMaxScale: f32,
  // The main belt's tint per Kirkwood band, inner to outer; all three its class tint in class mode.
  beltColor: array<vec4<f32>, 3>,
};

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) corner: vec2<f32>,
  // rgb the class tint, a the peak intensity (starPeakIntensity, occlusion folded in) the knee
  // compresses.
  @location(1) @interpolate(flat) tint: vec4<f32>,
};

struct PickOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) corner: vec2<f32>,
  @location(1) @interpolate(flat) word: u32,
};
