// asteroids/points/io.wesl — the dots' uniforms and varyings. TS twin: asteroidPointRenderer.ts's
// ASTEROID_UNIFORM_OFFSETS, pinned by asteroidPoints.parity.test.ts.

import package::lib::camera::CameraUniforms;

// Group 0 bindings 0-1 belong to lib/trailOcclusion; this is binding 2. 'cam.viewProj' takes
// eye-relative Mpc. 'sunFromCamAu' is the Sun minus the eye, composed in f64 on the CPU, so f32
// never carries the eye's distance from the origin. 'exposure' is the display lift times the
// Layer's brightness; the flux floor applies after it. 'classColor' is the tint per class in rgb
// and the class fade in w (0 culls the class). 'selectedRow' (0xFFFFFFFF = none) draws at
// 'selectedCamRelAu', the CPU mirror's f64 position, so a followed dot sits on the camera target.
struct AsteroidUniforms {
  cam: CameraUniforms,
  sunFromCamAu: vec3<f32>,
  exposure: f32,
  classColor: array<vec4<f32>, 5>,
  selectedCamRelAu: vec3<f32>,
  selectedRow: u32,
  windowFade: f32,
  // Pick only: the packed pick word of row 0 (pick code and sentinel offset folded in on the CPU).
  pickBase: u32,
  sizePx: f32,
};

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) relKm: vec3<f32>,
  @location(1) corner: vec2<f32>,
  // rgb the class tint, a the peak intensity (starPeakIntensity) the knee compresses.
  @location(2) @interpolate(flat) tint: vec4<f32>,
};

struct PickOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) relKm: vec3<f32>,
  @location(1) corner: vec2<f32>,
  @location(2) @interpolate(flat) word: u32,
};
