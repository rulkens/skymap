// meshBody/io.wesl — uniform + inter-stage declarations for the lit
// triangle-mesh body renderer.
//
// PLACEHOLDER (Task 15): the struct byte layout below is final and is the
// contract 'utils/gpu/packMeshBodyUniforms.ts' packs; the stages are stubs that
// Task 16 replaces with the real PBR + Earthshine shading.
//
// FRAME CONTRACT: 'camPosLocal' and 'dirToHost' are in the HOST body's fixed
// axes, relative to this body's centre, in metres -- the same axes the vertex
// stage's 'localPos = u.model * position' lands in. 'u.model' is the body's own
// tumble rotation only (for rotating normal/tangent); the view rotation lives in
// 'u.mvp' alone.
//
// One authoritative inter-stage struct so a '@location' drift between the two
// stages is structurally impossible, and it is the module's ONLY
// '@builtin(position)'-bearing struct -- a second one links fine and is rejected
// at 'createShaderModule' (the runtime-only landmine).
//
// ## Byte layout (uniform address space) -- 176 bytes, 44 f32
//
//   offset   0..63:  mvp                (mat4x4<f32>, column-major)
//   offset  64..75:  sunDirLocal        (vec3<f32> -- 16-byte aligned)
//   offset  76..79:  sunVisibleFraction (f32 -- fills the vec3's 4th slot, the
//                                        'RingUniforms.planetRadiusRatio' trick)
//   offset  80..127: model              (mat3x3<f32> -- 3 columns x 16 bytes)
//   offset 128..139: camPosLocal        (vec3<f32> -- 16-byte aligned)
//   offset 140..143: earthshineStrength (f32 -- fills camPosLocal's 4th slot)
//   offset 144..155: earthshineColor    (vec3<f32> -- 16-byte aligned)
//   offset 156..159: _pad0              (f32)
//   offset 160..171: dirToHost          (vec3<f32> -- unit, body centre -> host)
//   offset 172..175: _pad1              (f32 -- rounds the struct to 176 / 16)
//
// The first 80 bytes match 'LitBodyUniforms' byte-for-byte, but
// 'packLitBodyUniforms' can NOT be reused: it zeroes byte 76 that
// 'sunVisibleFraction' owns here.

struct MeshBodyUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  sunVisibleFraction: f32,
  model: mat3x3<f32>,
  camPosLocal: vec3<f32>,
  earthshineStrength: f32,
  earthshineColor: vec3<f32>,
  _pad0: f32,
  dirToHost: vec3<f32>,
  _pad1: f32,
};

struct MeshBodyVSOut {
  @builtin(position) clip: vec4<f32>,
  // Position on the mesh surface in the host's fixed axes, relative to the
  // body's centre, in metres -- the frame 'camPosLocal' and 'dirToHost' share.
  @location(0) localPos: vec3<f32>,
  @location(1) uv: vec2<f32>,
};
