// skyGrid/io.wesl — uniform block shared by the sky-grid vertex and fragment
// stages. Byte layout (304 bytes) mirrors skyGridRenderer.ts's packer:
//
//   offset   0 | camForward + tanHalfFovY
//   offset  16 | camRight   + aspect
//   offset  32 | camUp      + opacity (the Layer's handed fade)
//   offset  48 | frames[4], 64 bytes each: toWorld (mat3x3, 3 x 16) + colour
//                (rgb, a = 1 when the frame draws, 0 when it does not)

struct GridFrame {
  toWorld: mat3x3<f32>,
  color: vec4<f32>,
};

struct Uniforms {
  camForward: vec3<f32>,
  tanHalfFovY: f32,
  camRight: vec3<f32>,
  aspect: f32,
  camUp: vec3<f32>,
  opacity: f32,
  frames: array<GridFrame, 4>,
};

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
};
