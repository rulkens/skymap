// contactShadow/io.wesl -- uniforms for the projected contact-shadow box.
// 'packContactShadowUniforms.ts' writes this layout; keep the two in step.
//
// ## Byte layout (uniform address space) -- 128 bytes, 32 f32
//
//   offset  0..63:  boxToClip  (mat4x4<f32>, column-major) unit cube -> clip
//   offset 64..127: clipToBox  (mat4x4<f32>, column-major) its inverse

struct ContactShadowUniforms {
  boxToClip: mat4x4<f32>,
  clipToBox: mat4x4<f32>,
};
