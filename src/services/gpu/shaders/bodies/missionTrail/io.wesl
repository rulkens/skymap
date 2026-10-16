// missionTrail/io.wesl — vertex input and inter-stage struct for the sampled-
// craft trail. One instance = one segment; each endpoint is a world-Mpc position
// split into an f32 hi/lo pair (see utils/math/splitF64HiLo.ts). TS twin:
// missionTrailRenderer.ts's endpoint attribute table, pinned by its parity test.

import package::lib::camera::CameraUniforms;

struct TrailSegment {
  @location(0) aHi: vec3<f32>,
  @location(1) aLo: vec3<f32>,
  @location(2) bHi: vec3<f32>,
  @location(3) bLo: vec3<f32>,
};

// Group 0 bindings 0-1 belong to lib/trailOcclusion; this is binding 2, one
// dynamic-offset slot per craft. The hi/lo camera pair is camera.xyz in f64.
struct TrailUniforms {
  cam: CameraUniforms,
  camHi: vec3<f32>,
  opacity: f32,
  camLo: vec3<f32>,
  widthPx: f32,
  color: vec3<f32>,
};

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) relKm: vec3<f32>,
  @location(1) side: f32,
};
