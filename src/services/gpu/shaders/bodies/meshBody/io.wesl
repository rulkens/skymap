// meshBody/io.wesl — uniform + inter-stage declarations for the lit
// triangle-mesh body renderer.
//
// FRAME CONTRACT: 'camPosLocal' (metres, relative to this body's centre),
// 'dirToHost' and 'sunDirLocal' are all in the HOST body's fixed axes -- the
// axes the vertex stage's 'localPos = u.model * position' lands in, NOT the
// body's own frame that 'utils/camera/sunDirLocal.ts' returns. 'u.model' is the
// body's tumble rotation only (for rotating normal/tangent); the view rotation
// lives in 'u.mvp' alone.
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
  // Normal and tangent rotated by 'u.model' alone -- host axes, NOT view space.
  @location(0) worldNormal: vec3<f32>,
  // 'w' is the bake's handedness (+/-1); it rides through untouched, and the
  // fragment's bitangent is 'cross(n, t.xyz) * t.w'.
  @location(1) worldTangent: vec4<f32>,
  @location(2) uv: vec2<f32>,
  // Surface point in host axes relative to the body's centre, in metres -- the
  // frame 'camPosLocal' shares, so the view vector is their difference.
  @location(3) localPos: vec3<f32>,
};
