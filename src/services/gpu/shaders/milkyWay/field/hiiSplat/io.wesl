// hiiSplat/io.wesl — HiiSplatOut, the vertex-to-fragment interface shared
// by every HII pipeline (young stars, shells/DIG erosion, background
// extras). Carries 'corner' — contrast fieldSplat/io.wesl's FieldSplatOut —
// because every HII draw's header can carry a live quad cap (the quad-cap lever, io.wesl's
// perf.x doc), and shadeCommon.wesl's quadCapFeather needs the quad-local
// coordinate to fade a truncated edge.

struct HiiSplatOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
  @location(1) @interpolate(flat) inst: u32,
  @location(2) corner: vec2<f32>,
}
