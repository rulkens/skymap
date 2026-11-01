// satellites/points/io.wesl — per-satellite instance record and uniforms. TS twin:
// satellitePointRenderer.ts's attribute table and SATELLITE_UNIFORM_OFFSETS, pinned by
// satellitePoints.parity.test.ts.

import package::lib::camera::CameraUniforms;

// One satellite's TEME state at the last worker sweep, km and km/s from Earth's centre, its
// catalog index (the pick id) and its class (an index into 'classOpacity').
struct SatelliteInstance {
  @location(0) posKm: vec3<f32>,
  @location(1) velKmS: vec3<f32>,
  @location(2) catalogIndex: u32,
  @location(3) classCode: u32,
};

// Group 0 bindings 0-1 belong to lib/trailOcclusion; this is binding 2. 'earthKm' is Earth's
// centre minus the eye in world axes (composed in f64 on the CPU), 'temeToWorld*' the columns of
// the TEME to world rotation, 'dtSec' the sim seconds since the sweep.
struct SatelliteUniforms {
  cam: CameraUniforms,
  earthKm: vec3<f32>,
  dtSec: f32,
  temeToWorld0: vec3<f32>,
  opacity: f32,
  temeToWorld1: vec3<f32>,
  sizePx: f32,
  temeToWorld2: vec3<f32>,
  color: vec3<f32>,
  classOpacity: vec3<f32>,
  // Pick only: the packed pick word of catalog index 0 (source code and sentinel offset folded in
  // on the CPU).
  pickBase: u32,
};

struct PickOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) relKm: vec3<f32>,
  @location(1) corner: vec2<f32>,
  @location(2) @interpolate(flat) word: u32,
};

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) relKm: vec3<f32>,
  @location(1) corner: vec2<f32>,
  @location(2) @interpolate(flat) opacity: f32,
};
