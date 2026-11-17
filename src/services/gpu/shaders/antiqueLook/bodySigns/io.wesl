// antiqueLook/bodySigns/io.wesl — the sign quad's varyings, shared by its vertex and fragment.

struct SignOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) centre: vec2<f32>,
  @location(1) @interpolate(flat) r: f32,
}
