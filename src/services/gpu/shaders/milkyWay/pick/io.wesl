// milkyWay/pick/io.wesl — the byte-layout contract for the Milky-Way pick
// billboard, shared by vertex.wesl and pick.wesl and packed on the CPU by
// milkyWayPickRenderer. WESL cannot export a binding, so the consuming files
// redeclare @group/@binding over these structs; WGSL accepts the repeat as
// long as the layout matches, which importing one struct guarantees.

import package::lib::camera::CameraUniforms;

// @group(0), packed per pick — 96 bytes:
//   0  cam          CameraUniforms (80 B)
//   80 camPosWorld  vec3<f32>   } the two facts the apparent-size
//   92 pxPerRad     f32         } derivation reads, as points/vertex.wesl does
// The vec3 at 80 is already 16-aligned, so no pad precedes it.
struct Uniforms {
  cam: CameraUniforms,
  camPosWorld: vec3<f32>,
  pxPerRad: f32,
};

// @group(2), written once at construction — 32 bytes, all scene constants:
//   0  centerWorld  vec3<f32>  (Sgr A*)      16 radiusMpc  f32 (MILKY_WAY_RADIUS_MPC)
//   12 sourceCode   u32                      20 minSizePx  f32 (MILKY_WAY_PICK_MIN_SIZE_PX)
// Bytes 24..31 are WGSL's round-up to a 16-byte multiple.
struct MilkyWayPickUniforms {
  centerWorld: vec3<f32>,
  sourceCode: u32,
  radiusMpc: f32,
  minSizePx: f32,
};

// The pick fragment needs the unit-quad UV (to clip the billboard to an
// inscribed disk, so the hit target reads circular) and the packed identity,
// flat because integers cannot be linearly interpolated.
struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) packedPick: u32,
};
