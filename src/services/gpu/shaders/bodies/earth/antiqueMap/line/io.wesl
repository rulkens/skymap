// earth/antiqueMap/line/io.wesl — the line quad's varyings and the kinds both stages tell apart.

// Style bits (`antiqueEarthMapFormat.ts`) kind.
const KIND_REALM: u32 = 0u;
const KIND_PROVINCE: u32 = 1u;
const KIND_RIVER: u32 = 2u;

struct LineOut {
  @builtin(position) clip: vec4<f32>,
  // Segment ends in framebuffer px, and their arc lengths (km).
  @location(0) @interpolate(flat) ends: vec4<f32>,
  @location(1) @interpolate(flat) arc: vec2<f32>,
  // Line half-width at each end, px; then the band's half-width, px, and the fade.
  @location(2) @interpolate(flat) widths: vec4<f32>,
  @location(3) @interpolate(flat) kind: u32,
}
