// flow/io.wesl — shared structs for the flow-field ribbon render pipeline.
//
// The interface module the vertex and fragment stages must agree on byte-for-
// byte: the 'Cam' uniform layout and the 'VsOut' vertex->fragment interface.
// Bindings live in the consuming files (WESL bindings are module-local and
// cannot be exported) — vertex.wesl redeclares the @group(0) bindings it reads;
// fragment.wesl reads only its interpolated 'VsOut' inputs, so it binds nothing.
//
// Cam uniform byte layout (TS pads the buffer to 160 — see the flow renderer's
// uniform docblock):
//   mvp               mat4x4<f32> @ 0    (64 bytes)
//   model             mat4x4<f32> @ 64   (64 bytes)
//   width             f32         @ 128
//   aspect            f32         @ 132
//   phase             f32         @ 136
//   mode              u32         @ 140
//   intensity         f32         @ 144
//   boundaryFadeWidth f32         @ 148

struct Cam {
  mvp: mat4x4<f32>,
  model: mat4x4<f32>,
  width: f32,
  aspect: f32,
  phase: f32,
  mode: u32,
  intensity: f32,
  boundaryFadeWidth: f32,
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) col: vec3<f32>,
  @location(1) alpha: f32,
};
