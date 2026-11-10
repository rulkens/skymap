// antiqueLook/decor/io.wesl — the ornament quad's varyings and its two output rows.

struct DecorOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) @interpolate(flat) item: u32,
}

struct DecorInk {
  @location(0) ink: vec4<f32>,
  @location(1) hue: vec4<f32>,
}
