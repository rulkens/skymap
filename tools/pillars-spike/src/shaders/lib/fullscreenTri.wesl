// lib/fullscreenTri.wesl — shared 'covering triangle' geometry for every
// fullscreen pass (background, bloom bright/down/up, composite).
//
// Three vertices at (-1,-1), (3,-1), (-1,3) span the whole viewport [-1,1]²
// as a single oversized triangle. A single triangle (rather than a
// two-triangle quad) has no interior shared edge, so the rasteriser's
// centre-sample rule can't drop a pixel on the seam; the off-screen
// overdraw past [-1,1]² is discarded by clip hardware before fragment
// shading, so it costs nothing.
//
// Same sanctioned deviation as the galaxy-renderer's copy of this helper:
// 'fullscreenVertex' is a plain function, NOT an '@vertex' entry point,
// because the WESL linker inlines imported functions but is not guaranteed
// to preserve an imported entry point's NAME for the pipeline's
// 'entryPoint: "vs"' lookup. Each consuming shader declares its own
// two-line '@vertex fn vs' that calls this.

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
