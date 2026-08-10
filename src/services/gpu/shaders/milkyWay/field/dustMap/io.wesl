// dustMap/io.wesl — DustMapOut, the vertex-to-fragment interface for the
// dust column-accumulation pass (see fragment.wesl's header for what it
// accumulates). Same shape as fieldSplat/io.wesl's FieldSplatOut: this pass
// reuses the primary field's silhouette-quad geometry, just walking the DUST
// slice of 'comps' (io.wesl's counts.y/dustOffset) instead of the emission
// slice.

struct DustMapOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
  @location(1) @interpolate(flat) inst: u32,
}
