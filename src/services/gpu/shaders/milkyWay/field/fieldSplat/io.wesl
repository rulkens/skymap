// fieldSplat/io.wesl — FieldSplatOut, the vertex-to-fragment interface for
// the primary field emission pass (disc/arm/bulge, one quad per component).
// No 'corner' varying, unlike hiiSplat/io.wesl's HiiSplatOut: this pass has
// no quad-cap feather (io.wesl's perf.x is always 0 here, see vertex.wesl),
// so the corner has no reader — dropping the varying is part of the
// per-splat-type split, not an oversight.

struct FieldSplatOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
  @location(1) @interpolate(flat) inst: u32,
}
