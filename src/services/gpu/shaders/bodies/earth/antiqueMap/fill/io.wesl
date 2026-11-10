// earth/antiqueMap/fill/io.wesl — the realm fill's varyings.

struct FillOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) local: vec3<f32>,
  @location(1) @interpolate(flat) code: f32,
}
