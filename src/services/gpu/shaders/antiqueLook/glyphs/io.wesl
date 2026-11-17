// antiqueLook/glyphs/io.wesl — the glyph quad's varyings and the reach both stages size it by.

// A rayed star's long rays reach RAY_REACH × r: at 1× r they were nubs past the core at dpr 1.
const RAY_REACH: f32 = 2.0;

struct GlyphOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) centre: vec2<f32>,
  // x: ray length (device px), y: rays, w: turn (radians).
  @location(1) @interpolate(flat) shape: vec4<f32>,
}
