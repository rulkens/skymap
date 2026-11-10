// earth/antiqueMap/sign/io.wesl — the sign quad's varyings.

struct SignOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) local: vec2<f32>,
  // x size px, y seed, z fade.
  @location(1) @interpolate(flat) params: vec3<f32>,
  @location(2) @interpolate(flat) kind: u32,
}
