// bloom/io.wesl — the bloom family's varyings; 'uv' is the [0,1]² coordinate
// each fragment stage reads its source texture at.

struct FullscreenOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
}
