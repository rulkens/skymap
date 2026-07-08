// lib/fullscreenTri.wesl — shared 'covering triangle' geometry for every
// post-process pass (bloom bright/down/up + composite).
//
// The four post passes are all fullscreen image filters: no per-vertex
// inputs, no uniforms in the vertex stage — the vertices are synthesised
// from 'vertex_index' alone. Three vertices at (-1,-1), (3,-1), (-1,3)
// span the whole viewport [-1,1]² as a single oversized triangle. A single
// triangle (rather than a two-triangle quad) has no interior shared edge,
// so the rasteriser's centre-sample rule can't drop a pixel on the seam;
// the off-screen overdraw past [-1,1]² is discarded by clip hardware before
// fragment shading, so it costs nothing.
//
// ## Why this helper carries no '@vertex' attribute (sanctioned deviation)
//
// The idiomatic WESL 'own entry point' pattern: each consuming shader
// declares its OWN two-line '@vertex fn vs' that just calls
// 'fullscreenVertex'. The linker inlines imported functions but is not
// guaranteed to preserve an imported entry point's NAME for the pipeline's
// 'entryPoint: 'vs'' lookup — so the entry point must be declared locally
// in each file. This mirrors the repo's 'compositor/vertex.wesl' pattern.
// Consequently 'fullscreenVertex' is a plain function, not an entry point.

struct FullscreenOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

fn fullscreenVertex(vi: u32) -> FullscreenOut {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  var o: FullscreenOut;
  let xy = p[vi];
  o.pos = vec4<f32>(xy, 0.0, 1.0);
  // Flip Y for UV space: clip-space +y is up, texture-space +v is down.
  o.uv = vec2<f32>((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return o;
}
